'use strict';

const path = require('path');
const child_process = require('child_process');
const os = require('os');
const fs = require('fs');
const globby = require('globby');
const Table = require('@fontoxml/fontoxml-development-tools-module-core').TableCommand;

const fontoxpath = require('fontoxpath');
const DOMParser = require('xmldom').DOMParser,
	domParser = new DOMParser();

const truncateAttributeValueLength = 20;

function percentage (ratio) {
	return (Math.round(ratio * 10000) / 100) + '%';
}

const MAX_PER_BATCH = 1000;

function getDomsForRequest (req, res) {
	const fileList = [
		...req.options.files,
		...(req.options.glob ? globby.sync([req.options.glob], { cwd: process.cwd(), absolute: true }) : [])
	];
	let i = 0;
	const total = Math.ceil(fileList.length / MAX_PER_BATCH);
	// Read all files
	return (function readNextBatch (fileList, accum = []) {
		const slice = fileList.length > MAX_PER_BATCH ? fileList.slice(0, MAX_PER_BATCH) : fileList;
		const nextSlice = fileList.length > MAX_PER_BATCH ? fileList.slice(MAX_PER_BATCH) : [];

		return new Promise(resolve => {
				res.debug('Batch ' + (++i) + '/' + total);
				const child = child_process.fork(path.resolve(__dirname, '..', 'child_process.js'));

				child.on('message', message => {
					child.send({
						type: 'kill'
					})

					resolve(message);
				});

				child.send({
					type: 'analyze',
					fileList: slice
				});
			})
			.then(doms => {
				if (nextSlice.length) {
					return readNextBatch(nextSlice, accum.concat(doms));
				}

				return accum.concat(doms);
			});
	})(fileList);
}

function recursiveMergeChildProcessReults (destination, t) {
	Object.keys(t).forEach(key => {
		const value = t[key];

		if (typeof value === 'string') {
			return;
		}

		if (!destination[key]) {
			destination[key] = value;
			return;
		}
		if (typeof destination[key] !== typeof value) {
			throw new Error('Type mismatch for key "' + key + '": ' + (typeof value) + ' to ' + (typeof destination[key]));
		}
		if (typeof value === 'object') {
			destination[key] = recursiveMergeChildProcessReults(destination[key], value);
			return;
		}

		if (typeof value === 'number') {
			destination[key] = destination[key] + value;
			return;
		}

		throw new Error('Unhandled type for key "' + key + '": ' + (typeof value));
	});

	return destination;
}

module.exports = (fotno) => {
	fotno.registerCommand('xml-combinations')
		.setDescription(`Show which attribute combinations are common.`)
		.addOption('glob', 'g', 'Globbing pattern')
		.addOption(new fotno.MultiOption('files').setShort('f').setDescription('The source files').isRequired(false))
		.addOption(new fotno.MultiOption('attributes').setShort('a').setDescription('The attributes that are interesting').isRequired(true))
		.addOption(new fotno.MultiOption('elements').setShort('e').setDescription('The elements that are interesting').isRequired(true))
		.setController((req, res) => {
			res.caption(`fotno xml-combinations`);

			getDomsForRequest(req, res)
				.then(doms => {
					const elements = doms.reduce((elements, dom) => elements.concat(fontoxpath.evaluateXPathToNodes(
						'//element()[name() = ("' + req.options.elements.join('", "') + '")]',
						dom)), []);

					const stats = elements.reduce((stats, element) => {
						const attributeValues = req.options.attributes.map(name => element.getAttribute(name) || null);
						const combinationId = JSON.stringify({ element: element.nodeName, attributes: attributeValues });

						stats[combinationId] = (stats[combinationId] || 0) + 1;

						return stats;
					}, {});

					const orderedStats = Object.keys(stats)
						.map(info => Object.assign(JSON.parse(info), { occurrences: stats[info] }));

					const table = new Table(fotno, [
						{ name: '_el', default: true, label: 'Element', value: info => info.element },
						{ name: '_occs', default: true, label: '#', value: info => info.occurrences },
						...req.options.attributes.map((attr, i) => ({
							name: attr,
							default: true,
							label: attr,
							value: info => info.attributes[i]
						}))
					]);

					table.print(
						res,
						table.columnsOption.default,
						orderedStats,
					'_occs');
				});
		});

	fotno.registerCommand('xml-stats')
		.setDescription(`Generates some quantitative statistics about an XML codebase.`)
		.addOption('alphabetical', 'a', 'Sort stats alphabetically by element name')
		.addOption('no-truncate', 'T', 'Do not truncate large lists of attribute values')
		.addOption('glob', 'g', 'Globbing pattern')
		.addOption(new fotno.MultiOption('files').setShort('f').setDescription('The source files').isRequired(false))
		.addOption(new fotno.MultiOption('hide').setShort('i').setDescription('Attribute names whose values are hidden'))
		.addOption(new fotno.MultiOption('ignore').setShort('I').setDescription('Attributes that are not shown entirely'))
		.addOption('hide-all', null, 'Hide all attributes')
		.addOption('ignore-all', null, 'Ignore all attributes')
		.setController((req, res) => {
			res.caption(`fotno xml-stats`);

			getDomsForRequest(req, res)
				.then(doms => {
					return doms.reduce((stats, stat) => recursiveMergeChildProcessReults(stats, stat), {});
				})

				// Do a fucktonne of formatting
				.then(stats => {
					const elementStats = Object.keys(stats)
						.filter(elementName => elementName.charAt(0) !== '$')
						.map(elementName => Object.assign(stats[elementName], { $name: elementName }))
						.sort(req.options.alphabetical ?
							(a, b) => a.$name.localeCompare(b.$name) :
							(a, b) => b.$total - a.$total
						);

					res.break();

					elementStats.forEach(stat => {
						res.property(
							stat.$total + ' occs, ' + percentage(stat.$total/stats.$totalElements),
							stat.$name,
							20);

						if (req.options['ignore-all']) {
							return;
						}

						res.indent();

						Object.keys(stat)
							.filter(attrName => !req.options.ignore.includes(attrName))
							.filter(attrName => attrName.charAt(0) !== '$')
							.map(attrName => Object.assign(stat[attrName], { $name: attrName }))
							.sort((a, b) => b.$total - a.$total)
							.forEach(attrStat => {
								res.property(
									attrStat.$total + ' occs, ' + percentage(attrStat.$total / stat.$total),
									'@' + attrStat.$name,
									20);

								if (req.options['hide-all'] || req.options.hide.includes(attrStat.$name))
									return;

								res.indent();
								const attributeValues = Object.keys(attrStat)
									.filter(key => key.charAt(0) !== '$')
									.map(key => [key, attrStavalue])
									.sort((a, b) => b[1] - a[1]);

								attributeValues.slice(0, req.options['no-truncate'] ? attributeValues.length : truncateAttributeValueLength)
									.forEach(attrValueStat => {
										res.property(
										attrValueStat[1] + ' occs, ' + percentage(attrValueStat[1] / attrStat.$total),
										'"' + attrValueStat[0] + '"',
										20,
										'debug');
									});

								if (!req.options['no-truncate'] && attributeValues.length > truncateAttributeValueLength) {
									const unique = attributeValues.length - truncateAttributeValueLength,
										occs = attributeValues.slice(truncateAttributeValueLength)
											.reduce((total, attrValueStat) => total + attrValueStat[1], 0);
									res.debug('...and ' + (attributeValues.length - truncateAttributeValueLength) + ' unique others over ' + occs + ' occurrences');
								}

								res.outdent();
							});
						res.outdent();
					});

					res.break();

					res.properties([
						[stats.$totalElements, 'total elements'],
						[elementStats.length, 'total unique elements'],
						[stats.$totalAttributes, 'total attributes']
					], 'debug');
				})
				.catch(err => {
					throw err;
				});
		});
};

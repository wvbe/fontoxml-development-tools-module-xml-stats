'use strict';

const path = require('path');
const os = require('os');
const fs = require('fs');
const globby = require('globby');

const fontoxpath = require('fontoxpath');
const DOMParser = require('xmldom').DOMParser,
	domParser = new DOMParser();

const truncateAttributeValueLength = 20;

function percentage (ratio) {
	return (Math.round(ratio * 10000) / 100) + '%';
}

module.exports = (fotno) => {
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

			const fileList = [
				...req.options.files,
				...(req.options.glob ? globby.sync([req.options.glob], { cwd: process.cwd(), absolute: true }) : [])
			];

			res.caption(`fotno xml-stats`);

			let destroy = res.spinner('Reading ' + fileList.length + ' files');

			// Read all files
			return (function readNextBatch (fileList, accum = []) {
					const slice = fileList.length > 100 ? fileList.slice(0, 100) : fileList;
					const nextSlice = fileList.length > 100 ? fileList.slice(100) : [];

					return Promise.all(slice.map(filename => {
						return new Promise((resolve, reject) => fs.readFile(filename, 'utf8', (err, data) => {
							if (err) {
								res.notice(filename + ' could not be read: ' + err.message);
								return resolve(false);
							}
							resolve(data);
						}))
					}))
					.then(contents => {
						const elegible = contents.filter(c => !!c);
						return elegible.map(content => {
							try {
								return domParser.parseFromString(content, 'application/xml');
							} catch(err) {
								res.notice(filename + ' could not be parsed: ' + err.message);
								return false;
							}
						})
					})
					.then(doms => {
						if (nextSlice.length) {
							return readNextBatch(nextSlice, accum.concat(doms));
						}

						return accum.concat(doms);
					});
				})(fileList)
				.then(doms => {
					const elegible = doms.filter(c => !!c);

					destroy();
					destroy = res.spinner('Counting elements in ' + elegible.length + ' files');

					return doms.reduce((elements, dom) => elements.concat(fontoxpath.evaluateXPathToNodes('//element()', dom)), []);
				})

				// Format a statistics object
				.then(elements => {
					destroy();
					destroy = res.spinner('Concatenating statistics for ' + elements.length + ' elements');

					return elements.reduce((elementsByName, element) => {
							if (!elementsByName[element.nodeName])
								elementsByName[element.nodeName] = {
									$total: 0
								};

							++elementsByName[element.nodeName].$total;

							const attributes = element.attributes
								? Array.prototype.slice.call(element.attributes)
								: [];

							elementsByName.$totalAttributes += attributes.length;

							attributes
								.forEach(attr => {
									if (!elementsByName[element.nodeName][attr.localName])
										elementsByName[element.nodeName][attr.localName] = {
											$total: 0
										};

									++elementsByName[element.nodeName][attr.localName].$total;

									if (!elementsByName[element.nodeName][attr.localName][attr.nodeValue])
										elementsByName[element.nodeName][attr.localName][attr.nodeValue] = 0;

									++elementsByName[element.nodeName][attr.localName][attr.nodeValue];
								});

							return elementsByName;
						}, {
							$totalElements: elements.length,
							$totalAttributes: 0
						});
				})

				// Do a fucktonne of formatting
				.then(stats => {
					destroy();
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
									.map(key => [key, attrStat[key]])
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
					if (destroy) {
						destroy();
					}
					throw err;
				});
		});
};

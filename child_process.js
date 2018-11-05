'use strict';
const fs = require('fs');
const SSP = require('slimdom-sax-parser');
const fontoxpath = require('fontoxpath');

function analyze (files) {
	return files.reduce((deferred, fileName) => {
		return deferred.then(results => {
			return new Promise((resolve, reject) => fs.readFile(fileName, 'utf8', (err, data) => {
				if (err) {
					console.log(filename + ' could not be read: ' + err.message);

					throw err;
				}
				resolve(data);
			}))

			.then(xmlString => SSP.sync(xmlString))

			.then(xmlDom => {
				const elements = fontoxpath.evaluateXPathToNodes('//element()', xmlDom);

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
					$fileName: fileName,
					$totalElements: elements.length,
					$totalAttributes: 0
				});
			})

			.then(fileStats => {
				results.push(fileStats);
				return results;
			});
		});
	}, Promise.resolve([]));
}

process.on('message', (message) => {
	switch (message.type) {
		case 'analyze':

			return analyze(message.fileList).then(results => {
				process.send(results);
			});

		case 'kill':
			process.exit();

		default:
			console.log('Unknown message type', message);
	}
});

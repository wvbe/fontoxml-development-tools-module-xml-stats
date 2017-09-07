module.exports = fotno => {
	[
		require('./src/command.xml-stats.js')
	].forEach(mod => mod(fotno));
};


module.exports = function(grunt) {
	
	var parserFiles = ['PJNParser.prefix.js','PJNParser.js','PJNParser.suffix.js']

	grunt.initConfig({
		pkg : grunt.file.readJSON('package.json'),
		jison : {
			target : {
				options : {
					moduleType: 'js' 
				},
				files : {
					'PJNParser.js': 'PJNParser.jison'
				}
			}
		},
		concat: {
			options: {
				separator: ';',
			},
			target: {
				src: parserFiles,
				dest: 'parser-files.js'
			},
		},
		copy: {
			target: {
				src: 'parser-files.js',
				dest: '../src/lib/pjn-parser.js'
			}
		},
		clean: ["PJNParser.js","parser-files.js"]
	});

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-contrib-concat');
    grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-jison');

	grunt.registerTask('default',['jison','concat','copy','clean']);
};

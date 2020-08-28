module.exports = function init() {
  // Project configuration
  this.initConfig({
    pkg: this.file.readJSON('package.json'),

    // Browser version building
    noflo_browser: {
      build: {
        options: {
          exposed_modules: {
            noflo: 'noflo',
            'noflo-runtime-base': './src/Base.js',
          },
        },
        files: {
          'browser/noflo-runtime-base.js': ['component.json'],
        },
      },
    },

    // Automated recompilation and testing when developing
    watch: {
      files: ['spec/*.js', 'src/*.js', 'src/**/*.js'],
      tasks: ['test'],
    },

    // BDD tests on Node.js
    mochaTest: {
      nodejs: {
        src: ['spec/*.js'],
        options: {
          reporter: 'spec',
        },
      },
    },

    // Generate runner.html
    noflo_browser_mocha: {
      all: {
        options: {
          scripts: ['../browser/<%=pkg.name%>.js'],
        },
        files: {
          'spec/runner.html': ['spec/*.js'],
        },
      },
    },
    // BDD tests on browser
    mocha_phantomjs: {
      options: {
        output: 'spec/result.xml',
        reporter: 'spec',
        failWithOutput: true,
      },
      all: ['spec/runner.html'],
    },
  });

  // Grunt plugins used for building
  this.loadNpmTasks('grunt-noflo-browser');

  // Grunt plugins used for testing
  this.loadNpmTasks('grunt-contrib-watch');
  this.loadNpmTasks('grunt-mocha-test');
  this.loadNpmTasks('grunt-mocha-phantomjs');

  // Our local tasks
  this.registerTask('build', 'Build NoFlo for the chosen target platform', (target = 'all') => {
    if ((target === 'all') || (target === 'browser')) {
      this.task.run('noflo_browser');
    }
  });

  this.registerTask('test', 'Build NoFlo and run automated tests', (target = 'all') => {
    this.task.run(`build:${target}`);
    if ((target === 'all') || (target === 'nodejs')) {
      this.task.run('mochaTest');
    }
    if ((target === 'all') || (target === 'browser')) {
      this.task.run('noflo_browser_mocha');
      this.task.run('mocha_phantomjs');
    }
  });

  this.registerTask('default', ['test']);
};

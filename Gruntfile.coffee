module.exports = ->
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    # CoffeeScript compilation
    coffee:
      src:
        options:
          bare: true
        expand: true
        cwd: 'src'
        src: ['**.coffee']
        dest: ''
        ext: '.js'
      protocol:
        options:
          bare: true
        expand: true
        cwd: 'src/protocol'
        src: ['**.coffee']
        dest: 'protocol'
        ext: '.js'
      spec:
        options:
          transpile:
            presets: ['es2015']
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Browser version building
    noflo_browser:
      build:
        options:
          exposed_modules:
            noflo: 'noflo'
            'noflo-runtime-base': './Base.js'
        files:
          'browser/noflo-runtime-base.js': ['component.json']

    # Automated recompilation and testing when developing
    watch:
      files: ['spec/*.coffee', 'src/*.coffee', 'src/**/*.coffee']
      tasks: ['test']

    # BDD tests on Node.js
    mochaTest:
      nodejs:
        src: ['spec/*.coffee']
        options:
          reporter: 'spec'

    # Generate runner.html
    noflo_browser_mocha:
      all:
        options:
          scripts: ["../browser/<%=pkg.name%>.js"]
        files:
          'spec/runner.html': ['spec/*.js']
    # BDD tests on browser
    mocha_phantomjs:
      options:
        output: 'spec/result.xml'
        reporter: 'spec'
        failWithOutput: true
      all: ['spec/runner.html']

    # Coding standards
    coffeelint:
      src:
        files:
          src: ['src/*.coffee', 'src/**/*.coffee']
        options:
          max_line_length:
            value: 120
            level: 'warn'

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-noflo-browser'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-mocha-test'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', 'Build NoFlo for the chosen target platform', (target = 'all') =>
    if target is 'all' or target is 'nodejs'
      @task.run 'coffee:src'
      @task.run 'coffee:protocol'
    if target is 'all' or target is 'browser'
      @task.run 'noflo_browser'

  @registerTask 'test', 'Build NoFlo and run automated tests', (target = 'all') =>
    @task.run 'coffeelint'
    @task.run 'build'
    if target is 'all' or target is 'nodejs'
      @task.run 'mochaTest'
    if target is 'all' or target is 'browser'
      @task.run 'coffee:spec'
      @task.run 'noflo_browser_mocha'
      @task.run 'mocha_phantomjs'

  @registerTask 'default', ['test']

module.exports = ->
  # Project configuration
  @initConfig
    pkg: @file.readJSON 'package.json'

    # CoffeeScript compilation
    coffee:
      src:
        expand: true
        cwd: 'src'
        src: ['**.coffee']
        dest: ''
        ext: '.js'
      protocol:
        expand: true
        cwd: 'src/protocol'
        src: ['**.coffee']
        dest: 'protocol'
        ext: '.js'
      spec:
        options:
          bare: true
        expand: true
        cwd: 'spec'
        src: ['**.coffee']
        dest: 'spec'
        ext: '.js'

    # Browser version building
    exec:
      install:
        command: './node_modules/.bin/component install'
      build:
        command: './node_modules/.bin/component build -u component-json,component-coffee -o browser -n noflo-runtime-base -c'

    # Automated recompilation and testing when developing
    watch:
      files: ['spec/*.coffee', 'src/*.coffee', 'src/**/*.coffee']
      tasks: ['test']

    # BDD tests on Node.js
    cafemocha:
      nodejs:
        src: ['spec/*.coffee']
        options:
          reporter: 'dot'

    # BDD tests on browser
    mocha_phantomjs:
      options:
        output: 'spec/result.xml'
        reporter: 'dot'
      all: ['spec/runner.html']

    # Coding standards
    coffeelint:
      src:
        files:
          src: ['src/*.coffee', 'src/**/*.coffee']
        options:
          max_line_length:
            value: 80
            level: 'warn'

  # Grunt plugins used for building
  @loadNpmTasks 'grunt-contrib-coffee'
  @loadNpmTasks 'grunt-exec'

  # Grunt plugins used for testing
  @loadNpmTasks 'grunt-contrib-watch'
  @loadNpmTasks 'grunt-cafe-mocha'
  @loadNpmTasks 'grunt-mocha-phantomjs'
  @loadNpmTasks 'grunt-coffeelint'

  # Our local tasks
  @registerTask 'build', 'Build NoFlo for the chosen target platform', (target = 'all') =>
    if target is 'all' or target is 'nodejs'
      @task.run 'coffee:src'
      @task.run 'coffee:protocol'
    if target is 'all' or target is 'browser'
      @task.run 'exec'

  @registerTask 'test', 'Build NoFlo and run automated tests', (target = 'all') =>
    @task.run 'coffeelint'
    if target is 'all' or target is 'nodejs'
      @task.run 'cafemocha'
    if target is 'all' or target is 'browser'
      @task.run 'exec'
      @task.run 'coffee:spec'
      @task.run 'mocha_phantomjs'

  @registerTask 'default', ['test']

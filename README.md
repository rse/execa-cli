
Execa-CLI
=========

**Execute commands from the CLI with the Execa library**

<p/>
<img src="https://nodei.co/npm/execa-cli.png?downloads=true&stars=true" alt=""/>

<p/>

[![github (author stars)](https://img.shields.io/github/stars/rse?logo=github&label=author%20stars&color=%233377aa)](https://github.com/rse)
[![github (author followers)](https://img.shields.io/github/followers/rse?label=author%20followers&logo=github&color=%234477aa)](https://github.com/rse)

Abstract
--------

This is a tiny Command-Line Interface (CLI) for conveniently
and portably executing commands with the excellent
[Execa](https://github.com/sindresorhus/execa) process execution
library. It exposes the most useful Execa options as regular
command-line options and passes them through to Execa. The standard
input, output, and error streams of the executed command are inherited
from Execa, so the command behaves exactly as if it had been started
directly. The exit code of the command is relayed as the exit code of
Execa.

Compared to calling a command bare in the shell, this execution wrapping
CLI adds the following benefits, without requiring any shell scaffolding:

- **Scoped working directory**: the `--cwd` option changes the working
  directory of the command only. In contrast to a `cd dir && cmd`
  sequence, the working directory of the calling shell is left
  untouched, and no subshell has to be spawned to contain the change.

- **Timeouts**: the `--timeout` option terminates a command which runs
  too long, and `--kill-signal` and `--force-kill-after-delay` control
  how it is terminated. The POSIX shell has no equivalent, and the
  `timeout(1)` utility is not available everywhere.

- **Automatic cleanup**: with the default `--cleanup` behaviour, the
  command is terminated when `execa` itself terminates. A bare shell call
  instead could leave the command behind as an orphaned process.

- **Local binaries**: the `--prefer-local` option resolves commands from
  the local `node_modules/.bin` directory, so project-local tools can be
  called without an `npx` detour or a manual `PATH` manipulation.

- **Portability**: Execa runs `.cmd`, `.bat` and shebang scripts on
  Windows the same way as on Unix, by resolving the command through
  `PATHEXT` and escaping its arguments itself. The very same command
  line hence behaves consistently across platforms.

- **Explicit environment**: the `--env` option sets individual variables
  and `--no-extend-env` starts the command from an empty environment,
  independent of the syntax the calling shell provides for this.

- **Dotenv support**: a `.env` file in the current working directory is
  automatically loaded into the environment before the command is
  executed, so both the options driven by `EXECA_*` variables and the
  command itself see their variables. Neither a shell-specific `source`
  construct nor a wrapper like `dotenv-cli` is necessary.

- **Process tree termination**: the `--kill-tree` option runs the command
  in its own process group and terminates that entire group. A command
  which spawns further processes of its own hence leaves nothing behind,
  which neither a bare call nor a plain `kill` achieves.

Installation
------------

```
$ npm install -g execa-cli
```

Notice that the package is named `execa-cli`, while the provided command
is named just `execa`, for convenient use in the shell. Alternatively,
run it without any installation through `npx`, where the package and the
command have to be given separately:

```
$ npx -p execa-cli execa echo "hello world"
$ npx -p execa-cli execa --cwd /tmp --timeout 5000 -- ls -l
```

Usage
-----

```
Usage: execa [options] <command> [args...]

Execute commands from the CLI with the Execa library

Arguments:
  command                            command to execute
  args                               arguments passed to the command

Options:
  -V, --version                      show program version information
  -c, --cwd <dir>                    current working directory of the command
                                     (env: EXECA_CWD)
  -e, --env <key=value>              environment variable for the command
                                     (repeatable) (default: {})
  -E, --no-extend-env                do not inherit the environment of this
                                     process
  -s, --shell [shell]                execute the command inside a shell (env:
                                     EXECA_SHELL)
  -i, --input <text>                 text written to the standard input of the
                                     command
  -t, --timeout <ms>                 terminate the command after the given time
                                     (env: EXECA_TIMEOUT)
  -k, --kill-signal <signal>         signal used to terminate the command (env:
                                     EXECA_KILL_SIGNAL)
  -d, --force-kill-after-delay <ms>  send SIGKILL if the command is still
                                     running after the given time
  -l, --prefer-local                 prefer locally installed binaries in
                                     "node_modules/.bin"
  -L, --local-dir <dir>              directory to resolve the locally installed
                                     binaries from
  -n, --node                         execute the command as a Node.js file
  -C, --no-cleanup                   do not terminate the command when this
                                     process exits
  -K, --kill-tree                    terminate the entire process tree of the
                                     command, not just the command itself
  -H, --no-windows-hide              do not hide the command window on Windows
  -v, --verbose <level>              verbosity of the command logging (choices:
                                     "none", "short", "full", env:
                                     EXECA_VERBOSE)
  -h, --help                         show this usage help

Examples:
  $ execa echo "hello world"
  $ execa --cwd /tmp --timeout 5000 -- ls -l
  $ execa --prefer-local -- eslint --fix .
  $ execa --shell -- "cat foo.txt | wc -l"
  $ execa --kill-tree --timeout 60000 -- npm run dev
```

License
-------

Copyright &copy; 2026 Dr. Ralf S. Engelschall (http://engelschall.com/)

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


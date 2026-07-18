#!/usr/bin/env node
/*!
**  execa-cli -- Execute commands from the CLI with the Execa library
**  Copyright (c) 2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Distributed under MIT license <https://spdx.org/licenses/MIT.html>
*/

/*  built-in dependencies  */
import process                                   from "node:process"
import { readFileSync }                          from "node:fs"
import { fileURLToPath }                         from "node:url"

/*  external dependencies  */
import * as dotenvx                              from "@dotenvx/dotenvx"
import { Command, Option, InvalidArgumentError } from "commander"
import { execa }                                 from "execa"

/*  internal dependencies
    (read package.json at run-time relative to this module, so it
    resolves both when run as source and when run as compiled dist/ output)  */
const pkg = JSON.parse(readFileSync(
    fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")) as
    { name: string, version: string, bin: Record<string, string> }

/*  load potential .env file into the environment
    (optional, so stay silent if absent)  */
dotenvx.config({ quiet: true, ignore: [ "MISSING_ENV_FILE" ] })

/*  name of the executable  */
const cmd = "execa"

/*  emit a fatal error and terminate the process  */
const fatal = (msg: string): never => {
    process.stderr.write(`${cmd}: ERROR: ${msg}\n`)
    process.exit(1)
}

/*  the subset of POSIX signals used for terminating a process group  */
type Signal = "SIGINT" | "SIGTERM" | "SIGHUP" | "SIGKILL"

/*  parse an option value as a non-negative integer  */
const parseInteger = (value: string, name: string): number => {
    const num = Number(value)
    if (!Number.isInteger(num) || num < 0)
        throw new InvalidArgumentError(`invalid ${name} "${value}" (use a non-negative integer)`)
    return num
}

/*  parse an option value of the form "KEY=VALUE" into an accumulating record  */
const parseKeyValue = (value: string, previous: Record<string, string>): Record<string, string> => {
    const idx = value.indexOf("=")
    if (idx < 1)
        throw new InvalidArgumentError(`invalid environment assignment "${value}" (use "KEY=VALUE")`)
    return { ...previous, [value.slice(0, idx)]: value.slice(idx + 1) }
}

/*  parse the command-line options  */
const program = new Command()
program
    .name(cmd)
    .description("Execute commands from the CLI with the Execa library")
    .version(`${cmd} ${pkg.version}`, "-V, --version", "show program version information")
    .helpOption("-h, --help", "show this usage help")
    .argument("<command>", "command to execute")
    .argument("[args...]", "arguments passed to the command")
    .addOption(new Option("-c, --cwd <dir>", "current working directory of the command")
        .env("EXECA_CWD"))
    .addOption(new Option("-e, --env <key=value>", "environment variable for the command (repeatable)")
        .argParser(parseKeyValue)
        .default({}))
    .addOption(new Option("-E, --no-extend-env", "do not inherit the environment of this process"))
    .addOption(new Option("-s, --shell [shell]", "execute the command inside a shell")
        .env("EXECA_SHELL"))
    .addOption(new Option("-i, --input <text>", "text written to the standard input of the command"))
    .addOption(new Option("-t, --timeout <ms>", "terminate the command after the given time")
        .argParser((value) => parseInteger(value, "timeout"))
        .env("EXECA_TIMEOUT"))
    .addOption(new Option("-k, --kill-signal <signal>", "signal used to terminate the command")
        .env("EXECA_KILL_SIGNAL"))
    .addOption(new Option("-d, --force-kill-after-delay <ms>", "send SIGKILL if the command is still running after the given time")
        .argParser((value) => parseInteger(value, "force-kill delay")))
    .addOption(new Option("-l, --prefer-local", "prefer locally installed binaries in \"node_modules/.bin\""))
    .addOption(new Option("-L, --local-dir <dir>", "directory to resolve the locally installed binaries from"))
    .addOption(new Option("-n, --node", "execute the command as a Node.js file"))
    .addOption(new Option("-C, --no-cleanup", "do not terminate the command when this process exits"))
    .addOption(new Option("-K, --kill-tree", "terminate the entire process tree of the command, not just the command itself"))
    .addOption(new Option("-H, --no-windows-hide", "do not hide the command window on Windows"))
    .addOption(new Option("-v, --verbose <level>", "verbosity of the command logging")
        .choices([ "none", "short", "full" ])
        .env("EXECA_VERBOSE"))
    .addHelpText("after",
        "\n" +
        "Examples:\n" +
        `  $ ${cmd} echo "hello world"\n` +
        `  $ ${cmd} --cwd /tmp --timeout 5000 -- ls -l\n` +
        `  $ ${cmd} --prefer-local -- eslint --fix .\n` +
        `  $ ${cmd} --shell -- "cat foo.txt | wc -l"\n` +
        `  $ ${cmd} --kill-tree --timeout 60000 -- npm run dev\n`
    )
    .enablePositionalOptions()
    .passThroughOptions()
    .parse()
const opts = program.opts<{
    cwd?:                  string
    env:                   Record<string, string>
    extendEnv:             boolean
    shell?:                string | boolean
    input?:                string
    timeout?:              number
    killSignal?:           string
    forceKillAfterDelay?:  number
    preferLocal?:          boolean
    localDir?:             string
    node?:                 boolean
    cleanup:               boolean
    killTree?:             boolean
    windowsHide:           boolean
    verbose?:              "none" | "short" | "full"
}>()

/*  determine the command and its arguments  */
const [ command, args ] = program.processedArgs as [ string, string[] ]

/*  determine whether the environment has to be passed explicitly, as Execa
    honors "extendEnv" only in combination with an also given "env"  */
const passEnv = Object.keys(opts.env).length > 0 || !opts.extendEnv

/*  assemble the Execa options, passing through only the explicitly given ones,
    so that Execa's own defaults still apply to all remaining options  */
const options = {
    ...(opts.input === undefined ? { stdin: "inherit" } : {}),
    stdout:  "inherit",
    stderr:  "inherit",
    reject:  false,
    ...(opts.cwd                 !== undefined ? { cwd:                 opts.cwd                 } : {}),
    ...(passEnv                                ? { env:                 opts.env                 } : {}),
    ...(!opts.extendEnv                        ? { extendEnv:           false                    } : {}),
    ...(opts.shell               !== undefined ? { shell:               opts.shell               } : {}),
    ...(opts.input               !== undefined ? { input:               opts.input               } : {}),
    ...(opts.timeout             !== undefined ? { timeout:             opts.timeout             } : {}),
    ...(opts.killSignal          !== undefined ? { killSignal:          opts.killSignal          } : {}),
    ...(opts.forceKillAfterDelay !== undefined ? { forceKillAfterDelay: opts.forceKillAfterDelay } : {}),
    ...(opts.preferLocal         !== undefined ? { preferLocal:         opts.preferLocal         } : {}),
    ...(opts.localDir            !== undefined ? { localDir:            opts.localDir            } : {}),
    ...(opts.node                !== undefined ? { node:                opts.node                } : {}),
    ...(!opts.cleanup                          ? { cleanup:             false                    } : {}),
    ...(opts.killTree                          ? { detached:            true                     } : {}),
    ...(!opts.windowsHide                      ? { windowsHide:         false                    } : {}),
    ...(opts.verbose             !== undefined ? { verbose:             opts.verbose             } : {})
} as Parameters<typeof execa>[1]

/*  main entry point  */
async function main () {
    /*  execute the command  */
    const subprocess = execa(command, args, options)

    /*  in process tree mode the command is the leader of its own process
        group, so signaling the negated PID reaches all of its descendants  */
    const pgid = opts.killTree ? subprocess.pid : undefined
    const killTree = (signal: Signal) => {
        if (pgid === undefined)
            return
        try { process.kill(-pgid, signal) }
        catch { /*  group already gone  */ }
    }

    /*  relay interactive signals to the whole process group, as the
        detached command no longer shares the terminal's job control  */
    if (pgid !== undefined)
        for (const signal of [ "SIGINT", "SIGTERM", "SIGHUP" ] as Signal[])
            process.on(signal, () => killTree(signal))

    /*  await the command and relay its exit status  */
    const result = await subprocess

    /*  reap any descendants outliving the command itself, as Execa
        terminates only the command and not its whole process group  */
    killTree("SIGKILL")

    if (result.failed && result.exitCode === undefined)
        fatal(result.shortMessage ?? "command execution failed")
    process.exit(result.exitCode ?? 1)
}
main().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error)
    fatal(msg)
})


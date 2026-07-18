#!/usr/bin/env node
/*!
**  execa-cli -- Execute commands from the CLI with the Execa library
**  Copyright (c) 2026 Dr. Ralf S. Engelschall <rse@engelschall.com>
**  Distributed under MIT license <https://spdx.org/licenses/MIT.html>
*/

/*  built-in dependencies  */
import process                                   from "node:process"
import { readFileSync, writeFileSync }           from "node:fs"
import { constants }                             from "node:os"
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
    { version: string }

/*  load potential .env file into the environment
    (optional, so stay silent if absent)  */
dotenvx.config({ quiet: true, ignore: [ "MISSING_ENV_FILE" ] })

/*  name of the executable  */
const cmd = "execa"

/*  emit a fatal error and terminate the process  */
const fatal = (msg: string): never => {
    /*  write synchronously, as process.exit() would truncate a
        pending asynchronous write on a pipe  */
    writeFileSync(process.stderr.fd, `${cmd}: ERROR: ${msg}\n`)
    process.exit(1)
}

/*  the subset of POSIX signals used for terminating a process group  */
const signals = [ "SIGINT", "SIGTERM", "SIGHUP", "SIGKILL", "SIGQUIT", "SIGUSR1", "SIGUSR2" ] as const
type Signal = typeof signals[number]

/*  the subset of signals relayed from this process to the process group  */
const signalsRelayed = [ "SIGINT", "SIGTERM", "SIGHUP" ] as const satisfies readonly Signal[]

/*  the POSIX signal numbers used for the "128 + N" exit status convention  */
const signalNumber = constants.signals as Record<string, number | undefined>

/*  parse an option value as a non-negative integer  */
const parseInteger = (value: string, name: string): number => {
    if (!/^\d+$/.test(value))
        throw new InvalidArgumentError(`invalid ${name} "${value}" (use a non-negative integer)`)
    const num = Number(value)
    if (!Number.isSafeInteger(num))
        throw new InvalidArgumentError(`invalid ${name} "${value}" (value out of range)`)
    return num
}

/*  parse an option value of the form "KEY=VALUE" into an accumulating record  */
const parseKeyValue = (value: string, previous: Record<string, string>): Record<string, string> => {
    const idx = value.indexOf("=")
    if (idx < 1)
        throw new InvalidArgumentError(`invalid environment assignment "${value}" (use "KEY=VALUE")`)
    const key = value.slice(0, idx)
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
        throw new InvalidArgumentError(`invalid environment variable name "${key}"`)
    return { ...previous, [key]: value.slice(idx + 1) }
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
        .choices([ ...signals ])
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
    killSignal?:           Signal
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
const options: Parameters<typeof execa>[1] = {
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
}

/*  main entry point  */
async function main (): Promise<never> {
    /*  execute the command  */
    const subprocess = execa(command, args, options)

    /*  in process tree mode the command is the leader of its own process
        group, so signaling the negated PID reaches all of its descendants  */
    const pgid = opts.killTree && subprocess.pid ? subprocess.pid : undefined
    let unsignalable = false
    const signalTree = (signal: Signal | 0): boolean => {
        if (pgid === undefined || unsignalable)
            return false
        try { process.kill(-pgid, signal); return true }
        catch (error) {
            const code = (error as { code?: string }).code
            /*  "ESRCH" means the group is gone, "EPERM" means it still
                exists but is just not signalable by us, so stop retrying  */
            if (code !== "ESRCH" && code !== "EPERM")
                fatal(`failed to signal process group ${pgid}: ${String(error)}`)
            if (code === "EPERM")
                unsignalable = true
            return false
        }
    }

    /*  terminate or probe the whole process group  */
    const killTree  = (signal: Signal) => { signalTree(signal) }
    const aliveTree = () => signalTree(0)

    /*  relay interactive signals to the whole process group, as the
        detached command no longer shares the terminal's job control  */
    if (pgid !== undefined)
        for (const signal of signalsRelayed)
            process.on(signal, () => {
                killTree(signal)
                try { subprocess.kill(signal) }
                catch { /*  the command already exited, so nothing to signal  */ }
            })

    /*  await the command and relay its exit status  */
    const result = await subprocess

    /*  reap any descendants outliving the command itself, as Execa
        terminates only the command and not its whole process group:
        signal them gracefully first, then force-kill the remainder  */
    if (aliveTree()) {
        killTree(opts.killSignal ?? "SIGTERM")
        const deadline = Date.now() + (opts.forceKillAfterDelay ?? 5000)
        while (aliveTree() && Date.now() < deadline)
            await new Promise<void>((resolve) => { setTimeout(resolve, 50) })
        if (aliveTree())
            killTree("SIGKILL")
    }

    /*  relay the exit status, mapping a terminating signal onto the
        conventional "128 + N" shell exit status  */
    if (result.failed && result.exitCode === undefined)
        fatal(result.shortMessage ?? "command execution failed")
    if (result.exitCode !== undefined)
        process.exit(result.exitCode)
    const num = result.signal !== undefined ? signalNumber[result.signal] : undefined
    process.exit(num !== undefined ? 128 + num : 1)
}
main().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error)
    fatal(msg)
})


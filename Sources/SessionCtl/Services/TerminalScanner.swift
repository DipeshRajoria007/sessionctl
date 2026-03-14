import Foundation
import AppKit

struct DiscoveredSession: Sendable {
    let tty: String
    let terminalApp: TerminalAppType
    let windowIndex: Int
    let tabIndex: Int
    let windowName: String
    let isBusy: Bool
    let pid: Int
    let foregroundProcess: String
    let directory: String?
    let repoRoot: String?
    let repoName: String?
    let branch: String?
}

class TerminalScanner {
    private let queue = DispatchQueue(label: "com.sessionctl.scanner", qos: .utility)
    private var fastTimer: DispatchSourceTimer?
    private var mediumTimer: DispatchSourceTimer?
    private var slowTimer: DispatchSourceTimer?
    private var isRunning = false

    // Cached data from each tier
    private let lock = NSLock()
    private var processMap: [String: (pid: Int, process: String)] = [:]  // tty -> (pid, foreground process)
    private var shellPidMap: [String: Int] = [:]  // tty -> shell pid (for CWD lookup)
    private var tabEntries: [TabEntry] = []
    private var cwdMap: [Int: String] = [:]  // pid -> cwd
    private var gitCache: [String: (root: String, name: String, branch: String)] = [:]  // dir -> git info

    private var lastLabels: [String: String] = [:]  // tty -> last set label

    var onUpdate: (([DiscoveredSession]) -> Void)?

    struct TabEntry: Sendable {
        let tty: String
        let terminalApp: TerminalAppType
        let windowIndex: Int
        let tabIndex: Int
        let windowName: String
        let isBusy: Bool
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true

        // Fast tier: ps every 2s
        fastTimer = createTimer(interval: 2.0) { [weak self] in
            self?.pollProcesses()
        }

        // Medium tier: AppleScript + lsof every 5s
        mediumTimer = createTimer(interval: 5.0) { [weak self] in
            self?.pollTabs()
        }

        // Slow tier: git info every 10s
        slowTimer = createTimer(interval: 10.0) { [weak self] in
            self?.pollGitInfo()
            self?.emitSessions()
            self?.updateLabels()
        }

        // Run initial scan immediately
        queue.async { [weak self] in
            self?.pollProcesses()
            self?.pollTabs()
            self?.pollGitInfo()
            self?.emitSessions()
        }
    }

    func stop() {
        isRunning = false
        fastTimer?.cancel()
        mediumTimer?.cancel()
        slowTimer?.cancel()
        fastTimer = nil
        mediumTimer = nil
        slowTimer = nil
    }

    // MARK: - Timer Helper

    private func createTimer(interval: TimeInterval, handler: @escaping () -> Void) -> DispatchSourceTimer {
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now() + interval, repeating: interval)
        timer.setEventHandler(handler: handler)
        timer.resume()
        return timer
    }

    // MARK: - Fast Tier: Process Scanning

    private static let shellNames: Set<String> = ["zsh", "bash", "-zsh", "-bash", "login", "fish"]

    private func pollProcesses() {
        // ps -eo tty,pid,stat,comm — get all processes with TTY
        guard let output = runCommand("/bin/ps", args: ["-eo", "tty,pid,stat,comm"]) else { return }

        var newMap: [String: (pid: Int, process: String)] = [:]
        var newShellMap: [String: Int] = [:]
        let lines = output.components(separatedBy: "\n").dropFirst()  // skip header

        for line in lines {
            let parts = line.trimmingCharacters(in: .whitespaces)
                .components(separatedBy: .whitespaces)
                .filter { !$0.isEmpty }
            guard parts.count >= 4 else { continue }

            let tty = parts[0]
            guard tty != "??" && tty != "?", let pid = Int(parts[1]) else { continue }

            let stat = parts[2]
            let comm = parts[3..<parts.count].joined(separator: " ")
            let processName = (comm as NSString).lastPathComponent
            let isShell = Self.shellNames.contains(processName)
            let devTTY = tty.hasPrefix("/dev/") ? tty : "/dev/" + tty

            // Track shell PIDs for CWD lookup (lsof only returns shell processes)
            if isShell {
                newShellMap[devTTY] = pid
            }

            // Prefer foreground processes (stat contains "+")
            let isForeground = stat.contains("+")

            if isForeground {
                if let existing = newMap[devTTY] {
                    let existingIsShell = Self.shellNames.contains(existing.process)
                    if existingIsShell && !isShell {
                        newMap[devTTY] = (pid, processName)
                    }
                } else {
                    newMap[devTTY] = (pid, processName)
                }
            } else if newMap[devTTY] == nil {
                newMap[devTTY] = (pid, processName)
            }
        }

        lock.lock()
        processMap = newMap
        shellPidMap = newShellMap
        lock.unlock()

        // Also emit after fast scan for responsiveness
        emitSessions()
    }

    // MARK: - Medium Tier: Tab Enumeration + CWD

    private func pollTabs() {
        var entries: [TabEntry] = []

        // iTerm2
        if isAppRunning(bundleId: "com.googlecode.iterm2") {
            if let itermEntries = enumerateITerm2() {
                entries.append(contentsOf: itermEntries)
            }
        }

        // Terminal.app
        if isAppRunning(bundleId: "com.apple.Terminal") {
            if let termEntries = enumerateTerminalApp() {
                entries.append(contentsOf: termEntries)
            }
        }

        // lsof for CWDs
        let newCwdMap = pollCWDs()

        lock.lock()
        tabEntries = entries
        cwdMap = newCwdMap
        lock.unlock()
    }

    private func enumerateITerm2() -> [TabEntry]? {
        let script = """
        set output to ""
        tell application "iTerm2"
            set wIdx to 0
            repeat with w in windows
                set wIdx to wIdx + 1
                set tIdx to 0
                repeat with t in tabs of w
                    set tIdx to tIdx + 1
                    repeat with s in sessions of t
                        try
                            set ttyPath to tty of s
                            set sName to name of s
                            set output to output & ttyPath & "\\t" & wIdx & "\\t" & tIdx & "\\t" & sName & "\\t" & "false" & "\\n"
                        end try
                    end repeat
                end repeat
            end repeat
        end tell
        return output
        """
        guard let output = runAppleScriptSync(script) else { return nil }
        return parseTabOutput(output, terminalApp: .iterm2)
    }

    private func enumerateTerminalApp() -> [TabEntry]? {
        let script = """
        set output to ""
        tell application "Terminal"
            set wIdx to 0
            repeat with w in windows
                set wIdx to wIdx + 1
                set tIdx to 0
                repeat with t in tabs of w
                    set tIdx to tIdx + 1
                    try
                        set ttyPath to tty of t
                        set tName to custom title of t
                        set tBusy to busy of t
                        set busyStr to "false"
                        if tBusy then set busyStr to "true"
                        set output to output & ttyPath & "\\t" & wIdx & "\\t" & tIdx & "\\t" & tName & "\\t" & busyStr & "\\n"
                    end try
                end repeat
            end repeat
        end tell
        return output
        """
        guard let output = runAppleScriptSync(script) else { return nil }
        return parseTabOutput(output, terminalApp: .terminal)
    }

    private func parseTabOutput(_ output: String, terminalApp: TerminalAppType) -> [TabEntry] {
        var entries: [TabEntry] = []
        let lines = output.components(separatedBy: "\n").filter { !$0.isEmpty }

        for line in lines {
            let parts = line.components(separatedBy: "\t")
            guard parts.count >= 5 else { continue }

            let tty = parts[0].trimmingCharacters(in: .whitespaces)
            guard !tty.isEmpty else { continue }

            let wIdx = Int(parts[1].trimmingCharacters(in: .whitespaces)) ?? 0
            let tIdx = Int(parts[2].trimmingCharacters(in: .whitespaces)) ?? 0
            let name = parts[3].trimmingCharacters(in: .whitespaces)
            let busy = parts[4].trimmingCharacters(in: .whitespaces) == "true"

            entries.append(TabEntry(
                tty: tty,
                terminalApp: terminalApp,
                windowIndex: wIdx,
                tabIndex: tIdx,
                windowName: name,
                isBusy: busy
            ))
        }
        return entries
    }

    private func pollCWDs() -> [Int: String] {
        // lsof -a -d cwd -c zsh -c bash -c fish -Fn
        guard let output = runCommand("/usr/sbin/lsof", args: ["-a", "-d", "cwd", "-c", "zsh", "-c", "bash", "-c", "fish", "-Fn"]) else {
            return [:]
        }

        var result: [Int: String] = [:]
        var currentPid: Int?

        for line in output.components(separatedBy: "\n") {
            if line.hasPrefix("p") {
                currentPid = Int(line.dropFirst())
            } else if line.hasPrefix("n"), let pid = currentPid {
                let path = String(line.dropFirst())
                if !path.isEmpty {
                    result[pid] = path
                }
            }
        }
        return result
    }

    // MARK: - Slow Tier: Git Info

    private func pollGitInfo() {
        lock.lock()
        let currentCwdMap = cwdMap
        let currentEntries = tabEntries
        let currentShellPidMap = shellPidMap
        lock.unlock()

        // Collect unique directories to check
        var dirsToCheck = Set<String>()
        for entry in currentEntries {
            if let dir = findCWDForTTY(entry.tty, cwdMap: currentCwdMap, shellPidMap: currentShellPidMap) {
                dirsToCheck.insert(dir)
            }
        }
        // Also check all known CWDs
        for (_, dir) in currentCwdMap {
            dirsToCheck.insert(dir)
        }

        var newCache: [String: (root: String, name: String, branch: String)] = [:]

        for dir in dirsToCheck {
            // Check if we already know this
            lock.lock()
            let cached = gitCache[dir]
            lock.unlock()

            if cached != nil {
                newCache[dir] = cached
                continue
            }

            // git rev-parse --show-toplevel
            if let root = runCommand("/usr/bin/git", args: ["-C", dir, "rev-parse", "--show-toplevel"])?.trimmingCharacters(in: .whitespacesAndNewlines),
               !root.isEmpty {
                let name = (root as NSString).lastPathComponent

                // git symbolic-ref --short HEAD
                let branch = runCommand("/usr/bin/git", args: ["-C", dir, "symbolic-ref", "--short", "HEAD"])?.trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? runCommand("/usr/bin/git", args: ["-C", dir, "rev-parse", "--short", "HEAD"])?.trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? ""

                newCache[dir] = (root: root, name: name, branch: branch)
            }
        }

        lock.lock()
        gitCache = newCache
        lock.unlock()
    }

    // MARK: - Emit Combined Sessions

    private func emitSessions() {
        lock.lock()
        let entries = tabEntries
        let procs = processMap
        let shells = shellPidMap
        let cwds = cwdMap
        let git = gitCache
        lock.unlock()

        var sessions: [DiscoveredSession] = []

        for entry in entries {
            let proc = procs[entry.tty]

            // Use shell PID (not foreground process PID) for CWD lookup,
            // because lsof -c zsh/bash only returns shell processes
            let directory = findCWDForTTY(entry.tty, cwdMap: cwds, shellPidMap: shells)
            let pid = shells[entry.tty] ?? proc?.pid ?? 0

            let gitInfo = directory.flatMap { git[$0] }
            let processName = proc?.process ?? ""
            let isShell = Self.shellNames.contains(processName) || processName.isEmpty

            sessions.append(DiscoveredSession(
                tty: entry.tty,
                terminalApp: entry.terminalApp,
                windowIndex: entry.windowIndex,
                tabIndex: entry.tabIndex,
                windowName: entry.windowName,
                isBusy: entry.isBusy || !isShell,
                pid: pid,
                foregroundProcess: isShell ? "" : processName,
                directory: directory,
                repoRoot: gitInfo?.root,
                repoName: gitInfo?.name,
                branch: gitInfo?.branch
            ))
        }

        onUpdate?(sessions)
    }

    private func findCWDForTTY(_ tty: String, cwdMap: [Int: String], shellPidMap: [String: Int]) -> String? {
        if let shellPid = shellPidMap[tty], let dir = cwdMap[shellPid] {
            return dir
        }
        return nil
    }

    // MARK: - Auto-labeling

    private func updateLabels() {
        lock.lock()
        let entries = tabEntries
        let procs = processMap
        let shells = shellPidMap
        let cwds = cwdMap
        let git = gitCache
        lock.unlock()

        for entry in entries {
            let directory = findCWDForTTY(entry.tty, cwdMap: cwds, shellPidMap: shells)
            let gitInfo = directory.flatMap { git[$0] }

            guard let info = gitInfo else { continue }

            let proc = procs[entry.tty]
            let processName = proc?.process ?? ""
            let isShell = ["zsh", "bash", "-zsh", "-bash", "login", "fish", ""].contains(processName)
            let toolPart = isShell ? "" : " | \(processName)"
            let label = "\(info.name) | \(info.branch)\(toolPart)"

            let lastLabel = lastLabels[entry.tty]
            guard label != lastLabel else { continue }

            lastLabels[entry.tty] = label

            let tty = entry.tty
            let termApp = entry.terminalApp
            DispatchQueue.global().async {
                let adapter = adapterFor(termApp)
                Task {
                    try? await adapter.updateLabel(tty: tty, label: label)
                }
            }
        }
    }

    // MARK: - Helpers

    private func isAppRunning(bundleId: String) -> Bool {
        NSWorkspace.shared.runningApplications.contains { $0.bundleIdentifier == bundleId }
    }

    private func runCommand(_ path: String, args: [String]) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = args

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8)
        } catch {
            return nil
        }
    }

    private func runAppleScriptSync(_ source: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        process.arguments = ["-e", source]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            process.waitUntilExit()
            guard process.terminationStatus == 0 else { return nil }
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8)
        } catch {
            return nil
        }
    }
}

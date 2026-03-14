import AppKit

protocol TerminalAdapter {
    func isAvailable() -> Bool
    func focusSession(tty: String) async throws
    func launchSession(_ def: SessionDefinition) async throws
    func updateLabel(tty: String, label: String) async throws
    func closeSession(tty: String) async throws
}

// MARK: - iTerm2

class ITerm2Adapter: TerminalAdapter {
    func isAvailable() -> Bool {
        NSWorkspace.shared.runningApplications.contains {
            $0.bundleIdentifier == "com.googlecode.iterm2"
        }
    }

    func focusSession(tty: String) async throws {
        let script = """
        tell application "iTerm2"
            activate
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if tty of s is "\(escapeForAppleScript(tty))" then
                            select t
                            select s
                            set index of w to 1
                            return
                        end if
                    end repeat
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }

    func launchSession(_ def: SessionDefinition) async throws {
        let cdCommand = "cd \(escapeForShell(def.repoPath))"
        let fullCommand: String
        if let cmd = def.startupCommand {
            fullCommand = "\(cdCommand) && \(cmd)"
        } else {
            fullCommand = cdCommand
        }

        let createClause = def.windowPreference == .newTab
            ? "tell current window to create tab with default profile"
            : "create window with default profile"

        let script = """
        tell application "iTerm2"
            activate
            \(createClause)
            tell current session of current window
                write text "\(escapeForAppleScript(fullCommand))"
            end tell
        end tell
        """
        try await runAppleScript(script)
    }

    func updateLabel(tty: String, label: String) async throws {
        let script = """
        tell application "iTerm2"
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if tty of s is "\(escapeForAppleScript(tty))" then
                            tell s
                                set name to "\(escapeForAppleScript(label))"
                            end tell
                            return
                        end if
                    end repeat
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }

    func closeSession(tty: String) async throws {
        let script = """
        tell application "iTerm2"
            repeat with w in windows
                repeat with t in tabs of w
                    repeat with s in sessions of t
                        if tty of s is "\(escapeForAppleScript(tty))" then
                            close s
                            return
                        end if
                    end repeat
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }
}

// MARK: - Terminal.app

class TerminalAppAdapter: TerminalAdapter {
    func isAvailable() -> Bool {
        NSWorkspace.shared.runningApplications.contains {
            $0.bundleIdentifier == "com.apple.Terminal"
        }
    }

    func focusSession(tty: String) async throws {
        let script = """
        tell application "Terminal"
            activate
            repeat with w in windows
                repeat with t in tabs of w
                    if tty of t is "\(escapeForAppleScript(tty))" then
                        set selected tab of w to t
                        set index of w to 1
                        return
                    end if
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }

    func launchSession(_ def: SessionDefinition) async throws {
        let cdCommand = "cd \(escapeForShell(def.repoPath))"
        let fullCommand: String
        if let cmd = def.startupCommand {
            fullCommand = "\(cdCommand) && \(cmd)"
        } else {
            fullCommand = cdCommand
        }

        if def.windowPreference == .newTab {
            let script = """
            tell application "Terminal"
                activate
                tell application "System Events"
                    keystroke "t" using command down
                end tell
                delay 0.5
                do script "\(escapeForAppleScript(fullCommand))" in front window
            end tell
            """
            try await runAppleScript(script)
        } else {
            let script = """
            tell application "Terminal"
                activate
                do script "\(escapeForAppleScript(fullCommand))"
            end tell
            """
            try await runAppleScript(script)
        }
    }

    func updateLabel(tty: String, label: String) async throws {
        let script = """
        tell application "Terminal"
            repeat with w in windows
                repeat with t in tabs of w
                    if tty of t is "\(escapeForAppleScript(tty))" then
                        set custom title of t to "\(escapeForAppleScript(label))"
                        set title displays custom title of t to true
                        return
                    end if
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }

    func closeSession(tty: String) async throws {
        let script = """
        tell application "Terminal"
            repeat with w in windows
                repeat with t in tabs of w
                    if tty of t is "\(escapeForAppleScript(tty))" then
                        close t
                        return
                    end if
                end repeat
            end repeat
        end tell
        """
        try await runAppleScript(script)
    }
}

// MARK: - Helpers

func adapterFor(_ terminalApp: TerminalAppType) -> TerminalAdapter {
    switch terminalApp {
    case .iterm2: return ITerm2Adapter()
    case .terminal, .unknown: return TerminalAppAdapter()
    }
}

func runAppleScript(_ source: String) async throws {
    try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
        DispatchQueue.global().async {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
            process.arguments = ["-e", source]

            let errorPipe = Pipe()
            process.standardError = errorPipe
            process.standardOutput = FileHandle.nullDevice

            do {
                try process.run()
                process.waitUntilExit()

                if process.terminationStatus != 0 {
                    let data = errorPipe.fileHandleForReading.readDataToEndOfFile()
                    let msg = String(data: data, encoding: .utf8) ?? "Unknown AppleScript error"
                    continuation.resume(throwing: AppleScriptError.executionFailed(msg))
                } else {
                    continuation.resume()
                }
            } catch {
                continuation.resume(throwing: error)
            }
        }
    }
}

enum AppleScriptError: Error, LocalizedError {
    case executionFailed(String)

    var errorDescription: String? {
        switch self {
        case .executionFailed(let msg): return "AppleScript: \(msg)"
        }
    }
}

func escapeForAppleScript(_ string: String) -> String {
    string
        .replacingOccurrences(of: "\\", with: "\\\\")
        .replacingOccurrences(of: "\"", with: "\\\"")
        .replacingOccurrences(of: "\n", with: "\\n")
        .replacingOccurrences(of: "\r", with: "\\r")
        .replacingOccurrences(of: "\t", with: "\\t")
}

func escapeForShell(_ string: String) -> String {
    "'" + string.replacingOccurrences(of: "'", with: "'\\''") + "'"
}

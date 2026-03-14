import Foundation

class ProcessMonitor {
    private let queue = DispatchQueue(label: "com.sessionctl.processmonitor", qos: .utility)
    private var fastTimer: DispatchSourceTimer?
    private var slowTimer: DispatchSourceTimer?
    private var isRunning = false

    private let lock = NSLock()
    private var registeredSessions: [UUID: pid_t] = [:]  // sessionID -> shellPID

    private static let shellNames: Set<String> = ["zsh", "bash", "-zsh", "-bash", "login", "fish"]

    var onProcessUpdate: ((UUID, SessionStore.ProcessUpdate) -> Void)?
    var onGitUpdate: ((UUID, SessionStore.GitUpdate) -> Void)?

    func registerSession(_ sessionID: UUID, shellPID: pid_t) {
        lock.lock()
        registeredSessions[sessionID] = shellPID
        lock.unlock()
    }

    func unregisterSession(_ sessionID: UUID) {
        lock.lock()
        registeredSessions.removeValue(forKey: sessionID)
        lock.unlock()
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true

        // Fast tier: process detection every 2s
        fastTimer = createTimer(interval: 2.0) { [weak self] in
            self?.pollProcesses()
        }

        // Slow tier: CWD + git info every 8s
        slowTimer = createTimer(interval: 8.0) { [weak self] in
            self?.pollGitInfo()
        }
    }

    func stop() {
        isRunning = false
        fastTimer?.cancel()
        slowTimer?.cancel()
        fastTimer = nil
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

    // MARK: - Fast Tier: Foreground Process Detection

    private func pollProcesses() {
        lock.lock()
        let sessions = registeredSessions
        lock.unlock()

        guard !sessions.isEmpty else { return }

        for (sessionID, shellPID) in sessions {
            guard let output = runCommand("/bin/ps", args: ["--ppid", "\(shellPID)", "-o", "pid=,comm="]) else {
                continue
            }

            let lines = output.components(separatedBy: "\n").filter { !$0.isEmpty }
            var foregroundProcess: String? = nil
            var tool: ToolType = .none

            for line in lines {
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                let parts = trimmed.components(separatedBy: .whitespaces).filter { !$0.isEmpty }
                guard parts.count >= 2 else { continue }

                let processName = (parts[1...].joined(separator: " ") as NSString).lastPathComponent

                if !Self.shellNames.contains(processName) {
                    foregroundProcess = processName
                    tool = ToolType.fromProcessName(processName)
                    break
                }
            }

            let update = SessionStore.ProcessUpdate(
                foregroundProcess: foregroundProcess,
                tool: tool,
                status: foregroundProcess != nil ? .running : .idle
            )
            onProcessUpdate?(sessionID, update)
        }
    }

    // MARK: - Slow Tier: CWD + Git Info

    private func pollGitInfo() {
        lock.lock()
        let sessions = registeredSessions
        lock.unlock()

        guard !sessions.isEmpty else { return }

        for (sessionID, shellPID) in sessions {
            // Get CWD via lsof
            guard let lsofOutput = runCommand("/usr/sbin/lsof", args: ["-p", "\(shellPID)", "-d", "cwd", "-Fn"]) else {
                continue
            }

            var directory: String? = nil
            for line in lsofOutput.components(separatedBy: "\n") {
                if line.hasPrefix("n") {
                    let path = String(line.dropFirst())
                    if !path.isEmpty {
                        directory = path
                    }
                }
            }

            guard let dir = directory else { continue }

            // Get git info
            var repoRoot: String? = nil
            var repoName: String? = nil
            var branch: String? = nil

            if let root = runCommand("/usr/bin/git", args: ["-C", dir, "rev-parse", "--show-toplevel"])?
                .trimmingCharacters(in: .whitespacesAndNewlines),
               !root.isEmpty {
                repoRoot = root
                repoName = (root as NSString).lastPathComponent

                branch = runCommand("/usr/bin/git", args: ["-C", dir, "symbolic-ref", "--short", "HEAD"])?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    ?? runCommand("/usr/bin/git", args: ["-C", dir, "rev-parse", "--short", "HEAD"])?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
            }

            let update = SessionStore.GitUpdate(
                directory: dir,
                repoRoot: repoRoot,
                repoName: repoName,
                branch: branch
            )
            onGitUpdate?(sessionID, update)
        }
    }

    // MARK: - Command Helper

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
}

import SwiftUI
import SwiftTerm
import AppKit

struct TerminalSessionView: NSViewRepresentable {
    let sessionID: UUID
    let startingDirectory: String?
    var onShellPID: ((pid_t) -> Void)?
    var onDirectoryChange: ((String) -> Void)?
    var onTerminated: (() -> Void)?

    func makeNSView(context: Context) -> LocalProcessTerminalView {
        let terminalView = LocalProcessTerminalView(frame: .zero)
        terminalView.translatesAutoresizingMaskIntoConstraints = false

        context.coordinator.terminalView = terminalView
        terminalView.processDelegate = context.coordinator

        // Get user's default shell
        let shell = ProcessInfo.processInfo.environment["SHELL"] ?? "/bin/zsh"
        let home = NSHomeDirectory()

        // Environment variables
        var env = Terminal.getEnvironmentVariables(termName: "xterm-256color")
        env.append("LANG=en_US.UTF-8")
        if let path = ProcessInfo.processInfo.environment["PATH"] {
            env.append("PATH=\(path)")
        }
        env.append("HOME=\(home)")

        // Start the shell process with currentDirectory
        terminalView.startProcess(
            executable: shell,
            args: [],
            environment: env,
            execName: "-" + (shell as NSString).lastPathComponent,
            currentDirectory: startingDirectory
        )

        // Report the shell PID
        let pid = terminalView.process.shellPid
        onShellPID?(pid)

        return terminalView
    }

    func updateNSView(_ nsView: LocalProcessTerminalView, context: Context) {
        // No dynamic updates needed
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    class Coordinator: NSObject, LocalProcessTerminalViewDelegate {
        let parent: TerminalSessionView
        weak var terminalView: LocalProcessTerminalView?

        init(_ parent: TerminalSessionView) {
            self.parent = parent
        }

        func sizeChanged(source: LocalProcessTerminalView, newCols: Int, newRows: Int) {}

        func setTerminalTitle(source: LocalProcessTerminalView, title: String) {}

        func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
            guard let directory = directory else { return }
            DispatchQueue.main.async { [weak self] in
                self?.parent.onDirectoryChange?(directory)
            }
        }

        func processTerminated(source: TerminalView, exitCode: Int32?) {
            DispatchQueue.main.async { [weak self] in
                self?.parent.onTerminated?()
            }
        }
    }
}

extension String {
    var shellEscaped: String {
        "'" + self.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}

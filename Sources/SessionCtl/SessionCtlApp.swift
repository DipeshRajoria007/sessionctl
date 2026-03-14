import SwiftUI

@main
struct SessionCtlApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            MainWindow()
                .environmentObject(appDelegate.sessionStore)
                .environmentObject(appDelegate.splitManager)
        }
        .defaultSize(width: 1200, height: 800)
        .commands {
            CommandGroup(replacing: .newItem) {
                Button("New Terminal") {
                    appDelegate.newTerminal()
                }
                .keyboardShortcut("t", modifiers: .command)

                Divider()

                Button("Split Horizontal") {
                    appDelegate.splitHorizontal()
                }
                .keyboardShortcut("d", modifiers: .command)

                Button("Split Vertical") {
                    appDelegate.splitVertical()
                }
                .keyboardShortcut("d", modifiers: [.command, .shift])

                Divider()

                Button("Close Pane") {
                    appDelegate.closeCurrentPane()
                }
                .keyboardShortcut("w", modifiers: .command)
            }
            CommandGroup(after: .windowArrangement) {
                Button("Next Pane") {
                    appDelegate.splitManager.selectNextPane()
                }
                .keyboardShortcut("]", modifiers: .command)

                Button("Previous Pane") {
                    appDelegate.splitManager.selectPreviousPane()
                }
                .keyboardShortcut("[", modifiers: .command)
            }
        }
    }
}

@MainActor
class AppDelegate: NSObject, NSApplicationDelegate {
    let sessionStore = SessionStore()
    let splitManager = SplitManager()
    private var hotkeyManager: HotkeyManager?
    private var processMonitor: ProcessMonitor?

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupHotkey()
        startProcessMonitor()

        // Create initial terminal if none exist
        if splitManager.root == nil {
            newTerminal()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        hotkeyManager?.unregister()
        processMonitor?.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func setupHotkey() {
        hotkeyManager = HotkeyManager()
        hotkeyManager?.register {
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private func startProcessMonitor() {
        let monitor = ProcessMonitor()
        monitor.onProcessUpdate = { [weak self] sessionID, update in
            Task { @MainActor in
                self?.sessionStore.handleProcessUpdate(id: sessionID, update: update)
            }
        }
        monitor.onGitUpdate = { [weak self] sessionID, update in
            Task { @MainActor in
                self?.sessionStore.handleGitUpdate(id: sessionID, update: update)
            }
        }
        monitor.start()
        processMonitor = monitor
    }

    func newTerminal(directory: String? = nil) {
        let sessionID = sessionStore.createSession(directory: directory)
        splitManager.addPane(sessionID: sessionID)
    }

    func splitHorizontal() {
        guard let selected = splitManager.selectedPaneSessionID else { return }
        let sessionID = sessionStore.createSession(
            directory: sessionStore.session(for: selected)?.directory
        )
        splitManager.splitHorizontal(sessionID: sessionID)
    }

    func splitVertical() {
        guard let selected = splitManager.selectedPaneSessionID else { return }
        let sessionID = sessionStore.createSession(
            directory: sessionStore.session(for: selected)?.directory
        )
        splitManager.splitVertical(sessionID: sessionID)
    }

    func closeCurrentPane() {
        guard let selected = splitManager.selectedPaneSessionID else { return }
        splitManager.closePane(sessionID: selected)
        sessionStore.closeSession(id: selected)

        // Register shell PID removal with process monitor
        processMonitor?.unregisterSession(selected)
    }

    func registerShellPID(sessionID: UUID, pid: pid_t) {
        sessionStore.updateShellPID(sessionID, pid: pid)
        processMonitor?.registerSession(sessionID, shellPID: pid)
    }
}

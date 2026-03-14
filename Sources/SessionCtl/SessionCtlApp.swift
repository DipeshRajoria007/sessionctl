import SwiftUI

@main
struct SessionCtlApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        MenuBarExtra {
            PopoverView()
                .environmentObject(appDelegate.sessionStore)
                .environmentObject(appDelegate.workspaceManager)
        } label: {
            let count = appDelegate.sessionStore.appState.totalCount
            if count > 0 {
                Label("\(count)", systemImage: "terminal.fill")
            } else {
                Label("SessionCtl", systemImage: "terminal.fill")
            }
        }
        .menuBarExtraStyle(.window)
    }
}

@MainActor
class AppDelegate: NSObject, NSApplicationDelegate {
    let sessionStore = SessionStore()
    let workspaceManager = WorkspaceManager()
    private var socketServer: SocketServer?
    private var hotkeyManager: HotkeyManager?

    func applicationDidFinishLaunching(_ notification: Notification) {
        startSocketServer()
        sessionStore.startPruning()
        setupHotkey()
    }

    func applicationWillTerminate(_ notification: Notification) {
        socketServer?.stop()
        sessionStore.stopPruning()
        hotkeyManager?.unregister()
    }

    private func startSocketServer() {
        socketServer = SocketServer { [weak self] event in
            Task { @MainActor in
                self?.sessionStore.handleEvent(event)
            }
        }
        do {
            try socketServer?.start()
        } catch {
            print("[SessionCtl] Socket server failed: \(error)")
        }
    }

    private func setupHotkey() {
        hotkeyManager = HotkeyManager()
        hotkeyManager?.register {
            NSApp.activate(ignoringOtherApps: true)
        }
    }
}

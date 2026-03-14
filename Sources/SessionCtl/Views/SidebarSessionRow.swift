import SwiftUI

struct SidebarSessionRow: View {
    let session: Session
    @EnvironmentObject var splitManager: SplitManager
    @EnvironmentObject var sessionStore: SessionStore

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(session.tool.displayColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.displayTitle)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)

                if let fg = session.foregroundProcess {
                    Text(fg)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()
        }
        .padding(.vertical, 2)
        .contextMenu {
            Button("Close") {
                splitManager.closePane(sessionID: session.id)
                sessionStore.closeSession(id: session.id)
            }
            Divider()
            Button("Split Right") {
                if let appDelegate = NSApp.delegate as? AppDelegate {
                    splitManager.selectedPaneSessionID = session.id
                    appDelegate.splitHorizontal()
                }
            }
            Button("Split Down") {
                if let appDelegate = NSApp.delegate as? AppDelegate {
                    splitManager.selectedPaneSessionID = session.id
                    appDelegate.splitVertical()
                }
            }
            Divider()
            if let dir = session.directory {
                Button("Copy Path") {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(dir, forType: .string)
                }
            }
        }
    }
}

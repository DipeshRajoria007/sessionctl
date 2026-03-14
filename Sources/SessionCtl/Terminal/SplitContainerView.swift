import SwiftUI

struct SplitContainerView: View {
    let node: SplitNode
    @EnvironmentObject var sessionStore: SessionStore
    @EnvironmentObject var splitManager: SplitManager

    var body: some View {
        nodeView(for: node)
    }

    private func nodeView(for node: SplitNode) -> AnyView {
        switch node {
        case .leaf(_, let sessionID):
            AnyView(
                TerminalPaneView(sessionID: sessionID)
                    .id(sessionID)
            )
        case .horizontal(_, let first, let second):
            AnyView(
                HSplitView {
                    nodeView(for: first)
                    nodeView(for: second)
                }
            )
        case .vertical(_, let first, let second):
            AnyView(
                VSplitView {
                    nodeView(for: first)
                    nodeView(for: second)
                }
            )
        }
    }
}

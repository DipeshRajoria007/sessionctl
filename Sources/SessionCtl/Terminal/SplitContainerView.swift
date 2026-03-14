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
        case .horizontal(let id, let first, let second):
            AnyView(
                DraggableSplitView(
                    nodeID: id,
                    axis: .horizontal,
                    first: { nodeView(for: first) },
                    second: { nodeView(for: second) }
                )
            )
        case .vertical(let id, let first, let second):
            AnyView(
                DraggableSplitView(
                    nodeID: id,
                    axis: .vertical,
                    first: { nodeView(for: first) },
                    second: { nodeView(for: second) }
                )
            )
        }
    }
}

// MARK: - Draggable Split View with Snap

struct DraggableSplitView<First: View, Second: View>: View {
    let nodeID: UUID
    let axis: SplitAxis
    let first: () -> First
    let second: () -> Second

    @EnvironmentObject var splitManager: SplitManager
    @State private var isDragging = false
    @State private var isSnapping = false
    @State private var dragStartRatio: CGFloat = 0.5

    enum SplitAxis {
        case horizontal, vertical
    }

    private static var dividerThickness: CGFloat { 6 }
    private static var dividerVisualThickness: CGFloat { 2 }

    private var ratio: CGFloat {
        splitManager.ratio(for: nodeID)
    }

    var body: some View {
        GeometryReader { geo in
            let totalSize = axis == .horizontal ? geo.size.width : geo.size.height
            let divider = Self.dividerThickness
            let available = totalSize - divider
            let firstSize = available * ratio
            let secondSize = available * (1 - ratio)

            if axis == .horizontal {
                HStack(spacing: 0) {
                    first()
                        .frame(width: firstSize)

                    dividerView(totalSize: totalSize)

                    second()
                        .frame(width: secondSize)
                }
            } else {
                VStack(spacing: 0) {
                    first()
                        .frame(height: firstSize)

                    dividerView(totalSize: totalSize)

                    second()
                        .frame(height: secondSize)
                }
            }
        }
    }

    private func dividerView(totalSize: CGFloat) -> some View {
        ZStack {
            // Hit target (wider for easier grabbing)
            Rectangle()
                .fill(Color.clear)
                .frame(
                    width: axis == .horizontal ? Self.dividerThickness : nil,
                    height: axis == .vertical ? Self.dividerThickness : nil
                )
                .contentShape(Rectangle())

            // Visual divider line
            Rectangle()
                .fill(isDragging ? Color.accentColor : Color.gray.opacity(0.3))
                .frame(
                    width: axis == .horizontal ? Self.dividerVisualThickness : nil,
                    height: axis == .vertical ? Self.dividerVisualThickness : nil
                )

            // Snap indicator
            if isSnapping {
                Rectangle()
                    .fill(Color.accentColor.opacity(0.6))
                    .frame(
                        width: axis == .horizontal ? 4 : nil,
                        height: axis == .vertical ? 4 : nil
                    )
            }
        }
        .cursor(axis == .horizontal ? .resizeLeftRight : .resizeUpDown)
        .onTapGesture(count: 2) {
            withAnimation(.easeInOut(duration: 0.2)) {
                splitManager.setRatio(0.5, for: nodeID)
            }
        }
        .gesture(
            DragGesture(minimumDistance: 1)
                .onChanged { value in
                    if !isDragging {
                        isDragging = true
                        dragStartRatio = ratio
                    }
                    let offset = axis == .horizontal ? value.translation.width : value.translation.height
                    let available = totalSize - Self.dividerThickness
                    guard available > 0 else { return }

                    let startPos = available * dragStartRatio
                    let newPos = startPos + offset
                    let newRatio = newPos / available

                    // Check if we're near a snap point
                    let clamped = max(0.1, min(0.9, newRatio))
                    isSnapping = SplitManager.snapPoints.contains { abs(clamped - $0) < SplitManager.snapThreshold }

                    splitManager.setRatio(newRatio, for: nodeID)
                }
                .onEnded { _ in
                    isDragging = false
                    isSnapping = false
                }
        )
    }
}

// MARK: - Cursor modifier

extension View {
    func cursor(_ cursor: NSCursor) -> some View {
        self.onHover { inside in
            if inside {
                cursor.push()
            } else {
                NSCursor.pop()
            }
        }
    }
}

import Foundation
import SwiftUI

indirect enum SplitNode: Identifiable {
    case leaf(id: UUID, sessionID: UUID)
    case horizontal(id: UUID, first: SplitNode, second: SplitNode)
    case vertical(id: UUID, first: SplitNode, second: SplitNode)

    var id: UUID {
        switch self {
        case .leaf(let id, _): return id
        case .horizontal(let id, _, _): return id
        case .vertical(let id, _, _): return id
        }
    }

    var allSessionIDs: [UUID] {
        switch self {
        case .leaf(_, let sessionID):
            return [sessionID]
        case .horizontal(_, let first, let second),
             .vertical(_, let first, let second):
            return first.allSessionIDs + second.allSessionIDs
        }
    }

    func contains(sessionID: UUID) -> Bool {
        switch self {
        case .leaf(_, let sid):
            return sid == sessionID
        case .horizontal(_, let first, let second),
             .vertical(_, let first, let second):
            return first.contains(sessionID: sessionID) || second.contains(sessionID: sessionID)
        }
    }

    func removing(sessionID: UUID) -> SplitNode? {
        switch self {
        case .leaf(_, let sid):
            return sid == sessionID ? nil : self
        case .horizontal(let id, let first, let second):
            let newFirst = first.removing(sessionID: sessionID)
            let newSecond = second.removing(sessionID: sessionID)
            if let f = newFirst, let s = newSecond {
                return .horizontal(id: id, first: f, second: s)
            }
            return newFirst ?? newSecond
        case .vertical(let id, let first, let second):
            let newFirst = first.removing(sessionID: sessionID)
            let newSecond = second.removing(sessionID: sessionID)
            if let f = newFirst, let s = newSecond {
                return .vertical(id: id, first: f, second: s)
            }
            return newFirst ?? newSecond
        }
    }

    func replacingLeaf(sessionID: UUID, with replacement: SplitNode) -> SplitNode {
        switch self {
        case .leaf(_, let sid):
            return sid == sessionID ? replacement : self
        case .horizontal(let id, let first, let second):
            return .horizontal(
                id: id,
                first: first.replacingLeaf(sessionID: sessionID, with: replacement),
                second: second.replacingLeaf(sessionID: sessionID, with: replacement)
            )
        case .vertical(let id, let first, let second):
            return .vertical(
                id: id,
                first: first.replacingLeaf(sessionID: sessionID, with: replacement),
                second: second.replacingLeaf(sessionID: sessionID, with: replacement)
            )
        }
    }
}

@MainActor
class SplitManager: ObservableObject {
    @Published var root: SplitNode?
    @Published var selectedPaneSessionID: UUID?
    @Published var splitRatios: [UUID: CGFloat] = [:]  // nodeID -> ratio (0.0-1.0)

    /// Snap points for split ratios
    static let snapPoints: [CGFloat] = [0.25, 1.0/3.0, 0.5, 2.0/3.0, 0.75]
    static let snapThreshold: CGFloat = 0.02  // snap within 2% of a snap point

    func ratio(for nodeID: UUID) -> CGFloat {
        splitRatios[nodeID] ?? 0.5
    }

    func setRatio(_ ratio: CGFloat, for nodeID: UUID) {
        let clamped = max(0.1, min(0.9, ratio))
        splitRatios[nodeID] = snap(clamped)
    }

    private func snap(_ value: CGFloat) -> CGFloat {
        for point in Self.snapPoints {
            if abs(value - point) < Self.snapThreshold {
                return point
            }
        }
        return value
    }

    func addPane(sessionID: UUID) {
        let newLeaf = SplitNode.leaf(id: UUID(), sessionID: sessionID)

        if root == nil {
            root = newLeaf
        } else if let selected = selectedPaneSessionID, let currentRoot = root {
            // Split the selected pane horizontally
            let split = SplitNode.horizontal(
                id: UUID(),
                first: currentRoot,
                second: newLeaf
            )
            // Only wrap in a new split if the selected pane exists
            if currentRoot.contains(sessionID: selected) {
                root = currentRoot.replacingLeaf(
                    sessionID: selected,
                    with: SplitNode.horizontal(
                        id: UUID(),
                        first: SplitNode.leaf(id: UUID(), sessionID: selected),
                        second: newLeaf
                    )
                )
            } else {
                root = split
            }
        } else if let currentRoot = root {
            root = SplitNode.horizontal(
                id: UUID(),
                first: currentRoot,
                second: newLeaf
            )
        }

        selectedPaneSessionID = sessionID
    }

    func splitHorizontal(sessionID: UUID) {
        guard let selected = selectedPaneSessionID, let currentRoot = root else { return }
        let newLeaf = SplitNode.leaf(id: UUID(), sessionID: sessionID)
        let split = SplitNode.horizontal(
            id: UUID(),
            first: SplitNode.leaf(id: UUID(), sessionID: selected),
            second: newLeaf
        )
        root = currentRoot.replacingLeaf(sessionID: selected, with: split)
        selectedPaneSessionID = sessionID
    }

    func splitVertical(sessionID: UUID) {
        guard let selected = selectedPaneSessionID, let currentRoot = root else { return }
        let newLeaf = SplitNode.leaf(id: UUID(), sessionID: sessionID)
        let split = SplitNode.vertical(
            id: UUID(),
            first: SplitNode.leaf(id: UUID(), sessionID: selected),
            second: newLeaf
        )
        root = currentRoot.replacingLeaf(sessionID: selected, with: split)
        selectedPaneSessionID = sessionID
    }

    func closePane(sessionID: UUID) {
        guard let currentRoot = root else { return }
        root = currentRoot.removing(sessionID: sessionID)

        if selectedPaneSessionID == sessionID {
            selectedPaneSessionID = root?.allSessionIDs.first
        }
    }

    func selectNextPane() {
        guard let currentRoot = root, let selected = selectedPaneSessionID else { return }
        let allIDs = currentRoot.allSessionIDs
        guard let idx = allIDs.firstIndex(of: selected) else { return }
        let nextIdx = (idx + 1) % allIDs.count
        selectedPaneSessionID = allIDs[nextIdx]
    }

    func selectPreviousPane() {
        guard let currentRoot = root, let selected = selectedPaneSessionID else { return }
        let allIDs = currentRoot.allSessionIDs
        guard let idx = allIDs.firstIndex(of: selected) else { return }
        let prevIdx = (idx - 1 + allIDs.count) % allIDs.count
        selectedPaneSessionID = allIDs[prevIdx]
    }
}

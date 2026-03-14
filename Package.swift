// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SessionCtl",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "SessionCtl",
            path: "Sources/SessionCtl",
            exclude: ["Info.plist"]
        )
    ]
)

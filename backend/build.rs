fn main() -> Result<(), Box<dyn std::error::Error>> {
    // TODO: Enable once proto files are available
    // tonic_build::configure()
    //     .build_server(false)
    //     .compile(
    //         &[
    //             "../../control-plane/proto/control_plane.proto",
    //             "../../memory-service/proto/memory.proto",
    //             "../../iam-service/proto/iam.proto",
    //         ],
    //         &["../../proto-common", "../../proto-deps"],
    //     )?;
    
    println!("cargo:warning=Proto compilation disabled until proto files are available");
    Ok(())
}
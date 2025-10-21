import * as BABYLON from "@babylonjs/core";

export async function initWebXR(scene) {
    const xr = await scene.createDefaultXRExperienceAsync({
        uiOptions: { sessionMode: "immersive-vr", referenceSpaceType: "local-floor" },
        optionalFeatures: true,
    });

    const xrSessionManager = xr.baseExperience.sessionManager;
    xrSessionManager.onXRFrameObservable.addOnce(() => {
        xr.baseExperience.camera.position.set(0.0, 2.0, -1);
    });

    try {
        const fm = xr.baseExperience?.featuresManager;
        if (fm) {
            fm.disableFeature(BABYLON.WebXRFeatureName.HAND_TRACKING);
        }
    } catch {
        // Ignore WebXR feature disable errors; experience still usable without it.
    }

    return xr;
}

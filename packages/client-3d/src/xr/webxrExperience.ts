import * as BABYLON from "@babylonjs/core";
import "@babylonjs/core/XR/webXRDefaultExperience";
import { WebXRFeatureName } from "@babylonjs/core/XR/webXRFeaturesManager";

export async function initWebXR(
    scene: BABYLON.Scene,
    liftOffset: number,
    lookAtTarget?: BABYLON.Vector3
): Promise<BABYLON.WebXRDefaultExperience | null> {
    try {
        const xr = await scene.createDefaultXRExperienceAsync({
            uiOptions: {
                sessionMode: "immersive-vr",
                referenceSpaceType: "local-floor",
            },
            optionalFeatures: true,
        });

        const xrSessionManager = xr.baseExperience.sessionManager;
        xrSessionManager.onXRFrameObservable.addOnce(() => {
            xr.baseExperience.camera.position.set(0, liftOffset, 0);
            if (lookAtTarget) {
                xr.baseExperience.camera.setTarget(lookAtTarget);
            }
        });

        try {
            const fm = xr.baseExperience?.featuresManager;
            if (fm) {
                fm.disableFeature(WebXRFeatureName.HAND_TRACKING);
            }
        } catch (featureError) {
            console.warn("Unable to disable WebXR features:", featureError);
        }

        return xr;
    } catch (error) {
        console.warn("WebXR initialization failed. Continuing without XR.", error);
        return null;
    }
}

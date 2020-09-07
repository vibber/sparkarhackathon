

// How to load in modules
const Scene = require('Scene');
const WorldTransform = require('WorldTransform');
const R = require('Reactive');
const TouchGestures = require('TouchGestures');
const CameraInfo = require('CameraInfo');
const Animation = require('Animation');
const DeviceMotion = require('DeviceMotion');
const Patches = require('Patches');

// Use export keyword to make a symbol available in scripting debug console
export const Diagnostics = require('Diagnostics');

var text1;

var placedItemsCount = 6;

Promise.all([

	// Find Scene Object
	Scene.root.findByPath("**/placed*"),
	Scene.root.findByPath("**/project*"),
	Scene.root.findFirst('Camera'),
	Scene.root.findFirst('planeTracker0'),
	Patches.outputs.getPoint2D('screenSize'),
	Patches.outputs.getScalar('screenScale'),
	Patches.outputs.getPulse('pulseCapture'),
	Patches.outputs.getPulse('pulseStopCapture'),

]).then(function (results) {

	const placedObjects = results[0];
	const projectedPlanes = results[1];
	const cam = results[2];
	const tracker = results[3];
	const screenSize = results[4];
	const screenScale = results[5];
	const pulseCapture = results[6];
	const pulseStopCapture = results[7];

	//==============================================================================
	// Place projected pane at the placedMarker and scale it
	//==============================================================================

	for (var i = 0; i < placedItemsCount; i++) {
		placePlaneInWorld(projectedPlanes[i], placedObjects[i], cam, screenSize);
	}

	//==============================================================================
	// Subscribe to tap gestures. Set placedMarker on tap at the bottom on the screen onto tracked plane
	//==============================================================================
	TouchGestures.onTap().subscribeWithSnapshot( {
		previewX: CameraInfo.previewSize.x,
		previewY: CameraInfo.previewSize.y,
	}, function (gesture, snapshot) {

		var screen = gesture.location;
		// Because we can't manually create a Point2D object we use the gesture location object and 
		// change the values ourselves
		screen.x = snapshot.previewX / 2;
		screen.y = snapshot.previewY * 0.6667;

		// create snapshot output parameters for patches
		// This drives the capture of a camera freeze frame
		var count = 0;
		
		var snapshot0 = R.val(0);
		var snapshot1 = R.val(0);
		var snapshot2 = R.val(0);
		var snapshot3 = R.val(0);
		var snapshot4 = R.val(0);
		var snapshot5 = R.val(0);

		Patches.inputs.setScalar('snapshot0', snapshot0);
		Patches.inputs.setScalar('snapshot1', snapshot1);
		Patches.inputs.setScalar('snapshot2', snapshot2);
		Patches.inputs.setScalar('snapshot3', snapshot3);
		Patches.inputs.setScalar('snapshot4', snapshot4);
		Patches.inputs.setScalar('snapshot5', snapshot5);

		//==============================================================================
		// On each cycle of the animation trigger placement of placedmarker on plane
		//==============================================================================

		//Reset the snapshot parameter just before triggering it in the next function
		pulseCapture.subscribe(function(val) {
			var snapshotStr = 'snapshot' + count;
			Patches.inputs.setScalar(snapshotStr, R.val(0));

			//Set projected planes visible.
			projectedPlanes[count].hidden = R.val(true); 
		})

		pulseStopCapture.subscribeWithSnapshot({
			rotX: DeviceMotion.worldTransform.rotationX,
			rotY: DeviceMotion.worldTransform.rotationY,
			rotZ: DeviceMotion.worldTransform.rotationZ,
		}, function(val, snapshot) {

			tracker.performHitTest(screen).then((result) => {
				//Place object on plane
				if (result != null)
					placedObjects[count].transform.position = R.pack3(result.x, result.y, result.z);
				//Rotate to align to camera
				placedObjects[count].transform.rotationX = snapshot.rotX;
				placedObjects[count].transform.rotationY = snapshot.rotY;
				placedObjects[count].transform.rotationZ = snapshot.rotZ;

				//Set projected planes visible.
				projectedPlanes[count].hidden = R.val(false); 

				//Parameter for patches. Triggers capture of snapshot
				var snapshotStr = 'snapshot' + count;			
				Patches.inputs.setScalar(snapshotStr, R.val(1));

				count++;
				if (count>placedItemsCount - 1) count = 0;

			});

		});

	 });

});

//==============================================================================
// Functions for scaling and placing projected plane
//==============================================================================

// Set size of projectPlane to fill the whole screen while placing it in the world at the 
// position of the tracked plane
function placePlaneInWorld(projectedPlane, trackedPlane, cam, screenSize) {
	//Calculate distance from camera to tracked plane in world coordinates
	const camPos = camPosition();

	//Hack: manually subtract from distance
	const distance = camPos.sub(0.1).distance(trackedPlane.worldTransform.position);

	//Convert distance to a fraction value
	//The focalplane distance can be used for this
	const planePosFrac = R.sub(1, distance.div(cam.focalPlane.distance));

	//text1.text = trackedPlane.worldTransform.scale.y.toString();

	//Set projectedPlane
	projectedPlane.transform.scale = getPlane3DScale(screenSize, planePosFrac, trackedPlane);
	projectedPlane.transform.position = trackedPlane.transform.position;
	projectedPlane.transform.rotation = trackedPlane.transform.rotation;
}

// Get the size of the plane in 3d units
// planePosFraction is a number where campos = 1, focalplanepos = 0. 
// planePosFraction for things placed behind the focal plane are negative numbers
function getPlane3DScale(screenPixelSize, planePosFraction, trackedPlane) {
	// the height of the focal plane seems to always be 5 local units
	// The trackedplane is always 1 local unit but on the phone world coordinates it is 1.6xx
	// So we account for this difference by dividing with the world size of trackedplane.
	const k = R.val(5).div(trackedPlane.worldTransform.scale.y); 
	const ratio = screenPixelSize.x.div(screenPixelSize.y);
	const planeH = getPlaneHeight(k,planePosFraction)
	const planeW = ratio.mul(planeH);
	return R.pack3(planeW, planeH, 0);
}

function getPlaneHeight(screenPlaneH, planePosZ) {
	const fov = getFOV(screenPlaneH);
	const m = R.sub(1, planePosZ).mul(screenPlaneH);
	return R.tan(fov.div(2)).mul(m).mul(2);
}

function getFOV(h) {
	return R.div(h, h.mul(2)).atan2(1).mul(2);
}

//From https://github.com/positlabs/spark-distance-from-camera/blob/master/scripts/script.js
function camPosition() {
	var pixelPoint = R.point2d(R.val(0), R.val(0))
	// unproject a short distance. zero doesn't work
	return Scene.unprojectWithDepth(pixelPoint, 0.0001)
}
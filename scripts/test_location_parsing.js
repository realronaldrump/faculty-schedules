
import {
    detectLocationType,
    parseRoomLabel,
    getBuildingDisplay,
    getLocationDisplay,
    resolveBuilding,
    LOCATION_TYPE
} from '../src/utils/locationService.js';

import locationService from '../src/utils/locationService.js';

// Mock config with known issues
const mockBuildingConfig = {
    version: 1,
    buildings: [
        {
            id: 'goebel',
            code: 'GOEBEL',
            displayName: 'Goebel Building',
            aliases: [], // Missing 'Goebel' alias intentionally
            isActive: true
        },
        {
            id: 'gen-assign',
            code: 'GEN',
            displayName: 'General Assignment Room', // This should be filtered out
            aliases: ['General Assignment'],
            isActive: true
        },
        {
            id: 'jones',
            code: 'JONES',
            displayName: 'Mary Gibbs Jones',
            aliases: ['MGJ'],
            isActive: true
        }
    ]
};

console.log("Applying mock building config (with bad data)...");
locationService.applyBuildingConfig(mockBuildingConfig);

console.log("\n--- Verifying Active Buildings (Should NOT have General Assignment) ---\n");
const activeBuildings = locationService.getActiveBuildings();
const names = activeBuildings.map(b => b.displayName);
console.log("Active Buildings:", names);

if (names.includes("General Assignment Room")) {
    console.error("FAIL: 'General Assignment Room' was NOT filtered out!");
} else {
    console.log("PASS: 'General Assignment Room' was filtered out.");
}

console.log("\n--- Verifying Alias Injection (Goebel) ---\n");
const goebel = locationService.resolveBuilding("Goebel");
if (goebel && goebel.displayName === "Goebel Building") {
    console.log("PASS: 'Goebel' successfully resolved to 'Goebel Building'.");
} else {
    console.error("FAIL: 'Goebel' did not resolve to 'Goebel Building'.");
    console.log("Resolved to:", goebel);
}

console.log("\n--- Testing Parsing Logic with Fixes ---\n");

const cases = [
    "General Assignment Room",
    "General Assignment Room 101",
    "Goebel 101",
    "Goebel Building 101"
];

cases.forEach(testCase => {
    console.log(`Input: "${testCase}"`);

    const type = detectLocationType(testCase);
    console.log(`  > Location Type: ${type}`);

    const parsed = parseRoomLabel(testCase);
    if (parsed?.locationType === LOCATION_TYPE.PHYSICAL) {
        console.log(`  > Parsed Building: ${parsed.building?.displayName}`);
    } else {
        console.log(`  > Parsed as: ${parsed?.locationType}`);
    }
    console.log('---');
});

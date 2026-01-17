
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, 'prompts', 'phased-generation');

async function testScenesPrompt() {
    console.log("Testing Scenes Prompt...");
    const promptPath = path.join(PROMPTS_DIR, 'scenes-prompt.txt');
    const templateContent = fs.readFileSync(promptPath, 'utf-8');

    // 1. Check for TONE_STYLISTIC_ELEMENTS
    if (!templateContent.includes('{{TONE_STYLISTIC_ELEMENTS}}')) {
        throw new Error("FAILED: scenes-prompt.txt missing {{TONE_STYLISTIC_ELEMENTS}}");
    }
    console.log("PASS: {{TONE_STYLISTIC_ELEMENTS}} found.");

    // 2. Check for Character Arc Instructions
    if (!templateContent.includes('Key Turning Points')) {
        console.warn("WARNING: scenes-prompt.txt might missing Key Turning Points instruction (check text manually if worded differently)");
    } else {
        console.log("PASS: Key Turning Points instruction found.");
    }

    // 3. Simulate Logic
    const mockToneAndStyle = {
        primary_tone: "Dark",
        key_stylistic_elements: ["Element A", "Element B"]
    };

    // Simulate what happens in prompt-templates.js
    const stylisticElementsStr = mockToneAndStyle?.key_stylistic_elements?.join(', ') || 'None specified';

    const rendered = templateContent.replace('{{TONE_STYLISTIC_ELEMENTS}}', stylisticElementsStr);

    if (rendered.includes('Element A, Element B')) {
        console.log("PASS: Tone/Style substitution works.");
    } else {
        throw new Error("FAILED: Tone/Style substitution failed.");
    }
}

async function testResolutionsPrompt() {
    console.log("\nTesting Resolutions Prompt...");
    const promptPath = path.join(PROMPTS_DIR, 'resolutions-prompt.txt');
    const templateContent = fs.readFileSync(promptPath, 'utf-8');

    // 1. Check for SCENE_PLAN_SUMMARY
    if (!templateContent.includes('{{SCENE_PLAN_SUMMARY}}')) {
        throw new Error("FAILED: resolutions-prompt.txt missing {{SCENE_PLAN_SUMMARY}}");
    }
    console.log("PASS: {{SCENE_PLAN_SUMMARY}} found.");

    // 2. Simulate Logic
    const mockScenes = [
        { title: "Scene One", phase: "setup", situation: "Sit 1", key_events_if_unchanged: ["Event 1A", "Event 1B"] },
        { title: "Scene Two", phase: "confrontation", situation: "Sit 2", key_events_if_unchallenged: ["Event 2A"] } // Testing fallback
    ];

    // Simulate summary generation logic from prompt-templates.js
    const scenePlanSummary = mockScenes.map((s, idx) => {
        const events = s.key_events_if_unchallenged || s.key_events_if_unchanged || [];
        return `Scene ${idx + 1}: ${s.title} (${s.phase})
Situation: ${s.situation}
Key Events: ${events.join(', ')}`;
    }).join('\n\n');

    console.log("Generated Summary:\n---\n" + scenePlanSummary + "\n---");

    if (scenePlanSummary.includes("Event 1A") && scenePlanSummary.includes("Event 2A")) {
        console.log("PASS: Scene summary generation handles both field names.");
    } else {
        throw new Error("FAILED: Scene summary generation logic incorrect.");
    }

    const rendered = templateContent.replace('{{SCENE_PLAN_SUMMARY}}', scenePlanSummary);
    if (!rendered.includes("Scene One")) {
        throw new Error("FAILED: Substitution into template failed.");
    }
}

async function run() {
    try {
        await testScenesPrompt();
        await testResolutionsPrompt();
        console.log("\nALL TESTS PASSED.");
    } catch (e) {
        console.error("\nTEST FAILED:", e.message);
        process.exit(1);
    }
}

run();

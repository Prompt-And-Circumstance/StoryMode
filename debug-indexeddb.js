/**
 * IndexedDB Diagnostic Script for Story Mode
 *
 * Run this in the browser console to diagnose IndexedDB issues:
 *
 * In the browser console, paste and run:
 * await import('./scripts/extensions/third-party/Extension-StoryMode/debug-indexeddb.js')
 *
 * Or copy/paste the entire checkIndexedDB function and run it.
 */

export async function checkIndexedDB() {
    console.log('=== Story Mode IndexedDB Diagnostic ===\n');

    // 1. Check if IndexedDB is available
    console.log('1. Checking IndexedDB availability...');
    if (!window.indexedDB) {
        console.error('❌ IndexedDB is NOT available in this browser');
        console.log('   Possible causes:');
        console.log('   • Private/Incognito browsing mode');
        console.log('   • Browser privacy settings blocking storage');
        console.log('   • Very old browser version');
        return;
    }
    console.log('✅ IndexedDB is available');

    // 2. Check database list
    console.log('\n2. Checking existing databases...');
    try {
        const databases = await indexedDB.databases();
        console.log(`Found ${databases.length} databases:`, databases);
        const storyModeDB = databases.find(db => db.name === 'StoryModeBlueprintDB');
        if (storyModeDB) {
            console.log('✅ StoryModeBlueprintDB exists, version:', storyModeDB.version);
        } else {
            console.log('⚠️  StoryModeBlueprintDB does not exist (will be created on first use)');
        }
    } catch (error) {
        console.warn('⚠️  Unable to list databases (not supported in all browsers):', error.message);
    }

    // 3. Try opening the database
    console.log('\n3. Testing database open...');
    const openPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('StoryModeBlueprintDB', 1);

        request.onerror = (event) => {
            reject(event.target.error);
        };

        request.onsuccess = (event) => {
            resolve(event.target.result);
        };

        request.onupgradeneeded = (event) => {
            console.log('📝 Database upgrade needed (will create object stores)');
        };
    });

    try {
        const db = await openPromise;
        console.log('✅ Database opened successfully');
        console.log('   Object stores:', Array.from(db.objectStoreNames));

        // 4. Try reading from blueprints store
        console.log('\n4. Testing read from blueprints store...');
        const tx = db.transaction(['blueprints'], 'readonly');
        const store = tx.objectStore('blueprints');
        const getAllRequest = store.getAll();

        const blueprints = await new Promise((resolve, reject) => {
            getAllRequest.onsuccess = () => resolve(getAllRequest.result);
            getAllRequest.onerror = () => reject(getAllRequest.error);
        });

        console.log(`✅ Successfully read ${blueprints.length} blueprints from database`);
        if (blueprints.length > 0) {
            console.log('   Sample blueprint:', {
                id: blueprints[0].blueprint_id,
                title: blueprints[0].userMetadata?.title || 'Untitled',
                premise: blueprints[0].core_premise?.substring(0, 50) + '...'
            });
        }

        db.close();

    } catch (error) {
        console.error('❌ Database operation failed:', {
            name: error.name,
            message: error.message,
            code: error.code
        });
        console.log('\n🔍 Common Error Meanings:');
        console.log('   • UnknownError: Privacy/shield blocking, or private browsing');
        console.log('   • InvalidStateError: Database locked or corrupted');
        console.log('   • QuotaExceededError: Storage quota exceeded');
        console.log('   • VersionError: Version conflict');

        console.log('\n🛠️  Suggested Fixes:');
        console.log('   1. Disable Brave Shields or privacy blocking for this site');
        console.log('   2. Exit private/incognito browsing mode');
        console.log('   3. Enable "Site data" and "Cookies" for this domain');
        console.log('   4. Clear site data and reload (⚠️  will delete library)');
        console.log('   5. Try a different browser (Safari, Chrome, Firefox)');

        return;
    }

    // 5. Check storage quota
    console.log('\n5. Checking storage quota...');
    try {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usedMB = (estimate.usage / 1024 / 1024).toFixed(2);
            const quotaMB = (estimate.quota / 1024 / 1024).toFixed(2);
            const percentUsed = ((estimate.usage / estimate.quota) * 100).toFixed(1);

            console.log(`✅ Storage: ${usedMB} MB used of ${quotaMB} MB quota (${percentUsed}%)`);

            if (percentUsed > 90) {
                console.warn('⚠️  Storage is almost full! Consider cleaning up data.');
            }
        } else {
            console.log('ℹ️  Storage API not available (not critical)');
        }
    } catch (error) {
        console.warn('⚠️  Unable to check storage quota:', error.message);
    }

    console.log('\n=== Diagnostic Complete ===');
    console.log('If you see ✅ for all checks, IndexedDB is working correctly.');
    console.log('If you see ❌ errors, follow the suggested fixes above.');
}

// Auto-run if loaded as a script
if (typeof window !== 'undefined') {
    console.log('Story Mode IndexedDB Diagnostic loaded. Run: checkIndexedDB()');
    window.checkIndexedDB = checkIndexedDB;
}

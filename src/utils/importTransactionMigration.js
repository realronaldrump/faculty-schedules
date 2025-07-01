import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Migration utility to move localStorage import transactions to database
export const migrateLocalStorageTransactions = async () => {
  try {
    // Check if there are transactions in localStorage
    const localTransactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
    
    if (localTransactions.length === 0) {
      console.log('📦 No localStorage transactions to migrate');
      return { migrated: 0, skipped: 0 };
    }

    console.log(`🔄 Found ${localTransactions.length} transactions in localStorage, migrating to database...`);
    
    let migrated = 0;
    let skipped = 0;

    // Migrate each transaction
    for (const transactionData of localTransactions) {
      try {
        // Add migration metadata
        const migrationData = {
          ...transactionData,
          migratedFromLocalStorage: true,
          migrationTimestamp: new Date().toISOString(),
          // Ensure all required fields exist
          createdBy: transactionData.createdBy || 'migrated-user',
          lastModified: transactionData.lastModified || transactionData.timestamp || new Date().toISOString()
        };

        // Save to database
        await addDoc(collection(db, 'importTransactions'), migrationData);
        migrated++;
        console.log(`✅ Migrated transaction: ${transactionData.id || 'unknown'}`);
        
      } catch (error) {
        console.error(`❌ Failed to migrate transaction:`, error);
        skipped++;
      }
    }

    // Clear localStorage after successful migration
    if (migrated > 0) {
      localStorage.removeItem('importTransactions');
      console.log(`🧹 Cleared localStorage after migrating ${migrated} transactions`);
    }

    return { migrated, skipped, total: localTransactions.length };

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Check if migration is needed
export const checkMigrationNeeded = () => {
  const localTransactions = JSON.parse(localStorage.getItem('importTransactions') || '[]');
  return localTransactions.length > 0;
};

// Auto-run migration on app load if needed
export const autoMigrateIfNeeded = async () => {
  if (checkMigrationNeeded()) {
    console.log('🔄 Auto-migrating localStorage transactions...');
    try {
      const result = await migrateLocalStorageTransactions();
      console.log(`✅ Auto-migration complete: ${result.migrated} migrated, ${result.skipped} skipped`);
      return result;
    } catch (error) {
      console.error('❌ Auto-migration failed:', error);
      return { migrated: 0, skipped: 0, error: error.message };
    }
  }
  return null;
}; 
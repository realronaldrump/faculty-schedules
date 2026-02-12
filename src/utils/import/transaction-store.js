import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { cleanObject } from "./common";
import { ImportTransaction } from "./transaction-model";

export const saveTransactionToDatabase = async (transaction) => {
  try {
    const transactionRef = doc(db, "importTransactions", transaction.id);
    const transactionData = transaction.toFirestore();
    const cleanedData = cleanObject(transactionData);

    await setDoc(transactionRef, cleanedData, { merge: true });
    console.log(`💾 Saved transaction ${transaction.id} to database`);
  } catch (error) {
    console.error("Error saving transaction to database:", error);
    throw error;
  }
};

export const updateTransactionInStorage = async (updatedTransaction) => {
  try {
    await saveTransactionToDatabase(updatedTransaction);
  } catch (error) {
    console.error("Error updating transaction in database:", error);
    throw error;
  }
};

export const getImportTransactions = async () => {
  try {
    const transactionsQuery = query(
      collection(db, "importTransactions"),
      orderBy("timestamp", "desc"),
    );
    const snapshot = await getDocs(transactionsQuery);

    const transactions = snapshot.docs.map((docSnap) => {
      const data = { id: docSnap.id, ...docSnap.data() };
      return ImportTransaction.fromFirestore(data);
    });

    console.log(`📋 Loaded ${transactions.length} transactions from database`);
    return transactions;
  } catch (error) {
    console.error("Error loading transactions from database:", error);
    return [];
  }
};

export const deleteTransaction = async (transactionId) => {
  try {
    await deleteDoc(doc(db, "importTransactions", transactionId));
    console.log(`🗑️ Deleted transaction ${transactionId} from database`);
  } catch (error) {
    console.error("Error deleting transaction from database:", error);
    throw error;
  }
};

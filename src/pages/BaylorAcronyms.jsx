import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { PlusCircle, Edit, Trash2, Save, XCircle, AlertTriangle } from 'lucide-react';
import { logCreate, logUpdate, logDelete } from '../utils/changeLogger';

const BaylorAcronyms = ({ showNotification }) => {
    const [acronyms, setAcronyms] = useState([]);
    const [categories, setCategories] = useState([]);
    const [newAcronym, setNewAcronym] = useState({ acronym: '', standsFor: '', description: '', category: '' });
    const [editingId, setEditingId] = useState(null);
    const [editedAcronym, setEditedAcronym] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [confirmingDeleteId, setConfirmingDeleteId] = useState(null);

    const acronymsCollectionRef = collection(db, 'baylorAcronyms');

    const getAcronyms = useCallback(async () => {
        setIsLoading(true);
        try {
            const q = query(acronymsCollectionRef, orderBy('category'), orderBy('acronym'));
            const data = await getDocs(q);
            const acronymsData = data.docs.map(doc => ({ ...doc.data(), id: doc.id }));
            setAcronyms(acronymsData);
            
            const uniqueCategories = [...new Set(acronymsData.map(item => item.category))].filter(Boolean).sort();
            setCategories(uniqueCategories);
        } catch (error) {
            console.error("Error fetching acronyms:", error);
            showNotification('error', 'Fetch Error', 'Failed to load acronyms from the database.');
        } finally {
            setIsLoading(false);
        }
    }, [showNotification]);

    useEffect(() => {
        getAcronyms();
    }, [getAcronyms]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewAcronym({ ...newAcronym, [name]: value });
    };

    const handleAddAcronym = async () => {
        if (!newAcronym.acronym || !newAcronym.standsFor || !newAcronym.category) {
            showNotification('error', 'Validation Error', 'Please fill out Acronym, Stands For, and Category.');
            return;
        }

        const isDuplicate = acronyms.some(
            acronym => acronym.acronym.trim().toLowerCase() === newAcronym.acronym.trim().toLowerCase()
        );

        if (isDuplicate) {
            showNotification('error', 'Duplicate Entry', `The acronym "${newAcronym.acronym}" already exists.`);
            return;
        }

        setIsSubmitting(true);
        try {
            const acronymData = {
                ...newAcronym,
                acronym: newAcronym.acronym.trim(),
                standsFor: newAcronym.standsFor.trim(),
                description: newAcronym.description.trim(),
                category: newAcronym.category.trim()
            };
            
            const docRef = await addDoc(acronymsCollectionRef, acronymData);
            const newlyAdded = { ...acronymData, id: docRef.id };
            
            // Log the change
            await logCreate(
                `Acronym - ${acronymData.acronym} (${acronymData.standsFor})`,
                'baylorAcronyms',
                docRef.id,
                acronymData,
                'BaylorAcronyms.jsx - handleAddAcronym'
            );
            
            // Optimistic update
            const updatedAcronyms = [...acronyms, newlyAdded].sort((a, b) => {
                if (a.category < b.category) return -1;
                if (a.category > b.category) return 1;
                return a.acronym.localeCompare(b.acronym);
            });
            setAcronyms(updatedAcronyms);

            if (!categories.includes(newlyAdded.category)) {
                setCategories([...categories, newlyAdded.category].sort());
            }

            setNewAcronym({ acronym: '', standsFor: '', description: '', category: '' });
            showNotification('success', 'Success', 'Acronym added successfully.');
        } catch (error) {
            console.error("Error adding acronym: ", error);
            showNotification('error', 'Database Error', 'Failed to add acronym.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (acronym) => {
        setEditingId(acronym.id);
        setEditedAcronym(acronym);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditedAcronym({});
    };

    const handleUpdateAcronym = async (id) => {
        const isDuplicate = acronyms.some(
            acronym =>
                acronym.id !== id &&
                acronym.acronym.trim().toLowerCase() === editedAcronym.acronym.trim().toLowerCase()
        );

        if (isDuplicate) {
            showNotification('error', 'Duplicate Entry', `The acronym "${editedAcronym.acronym}" already exists.`);
            return;
        }
        
        setIsSubmitting(true);
        try {
            const originalAcronym = acronyms.find(acro => acro.id === id);
            const acronymDoc = doc(db, 'baylorAcronyms', id);
            const finalEditedAcronym = {
                ...editedAcronym,
                acronym: editedAcronym.acronym.trim(),
                standsFor: editedAcronym.standsFor.trim(),
                description: editedAcronym.description.trim(),
                category: editedAcronym.category.trim()
            };
            await updateDoc(acronymDoc, finalEditedAcronym);

            // Log the change
            await logUpdate(
                `Acronym - ${finalEditedAcronym.acronym} (${finalEditedAcronym.standsFor})`,
                'baylorAcronyms',
                id,
                finalEditedAcronym,
                originalAcronym,
                'BaylorAcronyms.jsx - handleUpdateAcronym'
            );

            // Optimistic update
            const updatedAcronyms = acronyms.map(acro => acro.id === id ? finalEditedAcronym : acro);
            setAcronyms(updatedAcronyms);

            const updatedCategories = [...new Set(updatedAcronyms.map(item => item.category))].filter(Boolean).sort();
            setCategories(updatedCategories);

            setEditingId(null);
            setEditedAcronym({});
            showNotification('success', 'Success', 'Acronym updated successfully.');
        } catch (error) {
            console.error("Error updating acronym: ", error);
            showNotification('error', 'Database Error', 'Failed to update acronym.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteAcronym = async (id) => {
        setIsSubmitting(true);
        try {
            const acronymToDelete = acronyms.find(acro => acro.id === id);
            const acronymDoc = doc(db, 'baylorAcronyms', id);
            await deleteDoc(acronymDoc);

            // Log the change
            await logDelete(
                `Acronym - ${acronymToDelete.acronym} (${acronymToDelete.standsFor})`,
                'baylorAcronyms',
                id,
                acronymToDelete,
                'BaylorAcronyms.jsx - handleDeleteAcronym'
            );

            // Optimistic update
            const updatedAcronyms = acronyms.filter(acro => acro.id !== id);
            setAcronyms(updatedAcronyms);

            const updatedCategories = [...new Set(updatedAcronyms.map(item => item.category))].filter(Boolean).sort();
            setCategories(updatedCategories);

            showNotification('success', 'Success', 'Acronym deleted successfully.');
        } catch (error) {
            console.error("Error deleting acronym: ", error);
            showNotification('error', 'Database Error', 'Failed to delete acronym.');
        } finally {
            setIsSubmitting(false);
            setConfirmingDeleteId(null); // Reset confirmation state
        }
    };

    const handleEditedInputChange = (e) => {
        const { name, value } = e.target;
        setEditedAcronym({ ...editedAcronym, [name]: value });
    }

    if (isLoading) {
        return <div className="text-center p-8">Loading Acronyms...</div>;
    }

    return (
        <div className="p-4 md:p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Baylor Acronyms</h1>

            <div className="mb-8 p-6 bg-white border border-gray-200 rounded-lg shadow-sm">
                <h2 className="text-xl font-semibold text-gray-700 mb-4 flex items-center">
                    <PlusCircle className="mr-2 text-baylor-green" /> Add New Acronym
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                    <input type="text" name="acronym" value={newAcronym.acronym} onChange={handleInputChange} placeholder="Acronym (e.g., HSD)" className="input-style col-span-1" />
                    <input type="text" name="standsFor" value={newAcronym.standsFor} onChange={handleInputChange} placeholder="Stands For" className="input-style col-span-1" />
                    <input type="text" name="description" value={newAcronym.description} onChange={handleInputChange} placeholder="Description/Context" className="input-style md:col-span-2 lg:col-span-1" />
                    <input 
                        type="text" 
                        name="category" 
                        value={newAcronym.category} 
                        onChange={handleInputChange} 
                        placeholder="Category (e.g., Academic)" 
                        className="input-style col-span-1"
                        list="categories-datalist"
                    />
                    <datalist id="categories-datalist">
                        {categories.map(cat => <option key={cat} value={cat} />)}
                    </datalist>
                    <button onClick={handleAddAcronym} disabled={isSubmitting} className="btn-primary col-span-full lg:col-span-1">
                        {isSubmitting ? 'Adding...' : 'Add Acronym'}
                    </button>
                </div>
            </div>

            {categories.length === 0 && !isLoading && (
                 <div className="text-center py-12 px-6 bg-white rounded-lg border border-gray-200 shadow-sm">
                    <h3 className="text-xl font-medium text-gray-700">No Acronyms Yet</h3>
                    <p className="text-gray-500 mt-2">Get started by adding a new acronym using the form above.</p>
                </div>
            )}

            {categories.map(category => (
                <div key={category} className="mb-8">
                    <h2 className="text-2xl font-semibold text-gray-800 mb-3 p-3 bg-gray-100 rounded-lg border-l-4 border-baylor-green">{category}</h2>
                    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-gray-200">
                        <table className="min-w-full">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="th-style text-left w-1/6">Acronym</th>
                                    <th className="th-style text-left w-1/4">Stands For</th>
                                    <th className="th-style text-left w-1/3">Description/Context</th>
                                    <th className="th-style w-auto text-right pr-6">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {acronyms.filter(a => a.category === category).map(acronym => (
                                    <tr key={acronym.id} className="hover:bg-gray-50 transition-colors duration-150">
                                        {editingId === acronym.id ? (
                                            <>
                                                <td className="px-4 py-3"><input type="text" name="acronym" value={editedAcronym.acronym} onChange={handleEditedInputChange} className="input-style w-full" /></td>
                                                <td className="px-4 py-3"><input type="text" name="standsFor" value={editedAcronym.standsFor} onChange={handleEditedInputChange} className="input-style w-full" /></td>
                                                <td className="px-4 py-3"><input type="text" name="description" value={editedAcronym.description} onChange={handleEditedInputChange} className="input-style w-full" /></td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex justify-end space-x-2">
                                                        <button onClick={() => handleUpdateAcronym(acronym.id)} disabled={isSubmitting} className="btn-icon-primary"><Save size={18} /></button>
                                                        <button onClick={handleCancelEdit} disabled={isSubmitting} className="btn-icon-secondary"><XCircle size={18} /></button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="px-4 py-3 font-medium text-gray-900">{acronym.acronym}</td>
                                                <td className="px-4 py-3 text-gray-600">{acronym.standsFor}</td>
                                                <td className="px-4 py-3 text-gray-600">{acronym.description}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {confirmingDeleteId === acronym.id ? (
                                                        <div className="flex justify-end items-center space-x-2">
                                                            <span className="text-sm text-yellow-600 flex items-center"><AlertTriangle size={16} className="mr-1" /> Delete?</span>
                                                            <button onClick={() => handleDeleteAcronym(acronym.id)} disabled={isSubmitting} className="btn-danger-sm">Confirm</button>
                                                            <button onClick={() => setConfirmingDeleteId(null)} disabled={isSubmitting} className="btn-secondary-sm">Cancel</button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex justify-end space-x-2">
                                                            <button onClick={() => handleEdit(acronym)} className="btn-icon-secondary"><Edit size={16} /></button>
                                                            <button onClick={() => setConfirmingDeleteId(acronym.id)} className="btn-icon-danger"><Trash2 size={16} /></button>
                                                        </div>
                                                    )}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default BaylorAcronyms; 
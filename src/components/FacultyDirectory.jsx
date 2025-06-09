import React, { useState } from 'react';
import { Edit, Save, X, BookUser, Mail, Phone } from 'lucide-react';

const FacultyDirectory = ({ facultyData, onUpdate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});

  const handleEdit = (faculty) => {
    setEditingId(faculty.id);
    setEditFormData(faculty);
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditFormData({});
  };

  const handleSave = () => {
    onUpdate(editFormData);
    setEditingId(null);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData({
      ...editFormData,
      [name]: type === 'checkbox' ? checked : value,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <h2 className="text-xl font-serif font-semibold text-baylor-green mb-4 flex items-center border-b border-baylor-gold pb-2">
        <BookUser className="mr-2 text-baylor-gold" size={20} />
        Faculty Directory
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-baylor-green/5">
            <tr>
              <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Name</th>
              <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Adjunct</th>
              <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Email</th>
              <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">Phone</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {facultyData.map(faculty => (
              <tr key={faculty.id} className="hover:bg-gray-50">
                {editingId === faculty.id ? (
                  <>
                    <td className="p-2">{faculty.name}</td>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        name="isAdjunct"
                        checked={!!editFormData.isAdjunct}
                        onChange={handleChange}
                        className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        name="email"
                        value={editFormData.email || ''}
                        onChange={handleChange}
                        className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10"
                        placeholder="email@baylor.edu"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        name="phone"
                        value={editFormData.phone || ''}
                        onChange={handleChange}
                        className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10"
                        placeholder="254-710-0000"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <div className="flex gap-2">
                        <button onClick={handleSave} className="p-2 text-green-600 hover:bg-green-100 rounded-full"><Save size={16} /></button>
                        <button onClick={handleCancel} className="p-2 text-red-600 hover:bg-red-100 rounded-full"><X size={16} /></button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3 text-gray-700 font-medium">{faculty.name}</td>
                    <td className="px-4 py-3 text-gray-700">{faculty.isAdjunct ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-gray-700">{faculty.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{faculty.phone || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => handleEdit(faculty)} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FacultyDirectory;
import React, { useState, useMemo } from 'react';
import { Edit, Save, X, BookUser, Mail, Phone, Building, Search, ArrowUpDown } from 'lucide-react';

const formatPhoneNumber = (phoneStr) => {
    if (!phoneStr) return '-';
    const cleaned = ('' + phoneStr).replace(/\D/g, '');
    if (cleaned.length === 10) {
        const match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
        if (match) {
            return `(${match[1]}) ${match[2]} - ${match[3]}`;
        }
    }
    return phoneStr;
};

const FacultyContactCard = ({ faculty, onClose }) => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-sm w-full mx-4 relative" onClick={e => e.stopPropagation()}>
            <button onClick={onClose} className="absolute top-2 right-2 p-2 text-gray-500 hover:bg-gray-100 rounded-full">
                <X size={20} />
            </button>
            <div className="text-center">
                <h3 className="text-2xl font-serif font-bold text-baylor-green">{faculty.name}</h3>
                <p className="text-md text-baylor-gold font-semibold">{faculty.isAdjunct ? 'Adjunct Faculty' : 'Faculty'}</p>
            </div>
            <div className="mt-6 space-y-4">
                <div className="flex items-center">
                    <Mail size={18} className="text-baylor-green mr-4" />
                    <span className="text-gray-700">{faculty.email || 'Not specified'}</span>
                </div>
                <div className="flex items-center">
                    <Phone size={18} className="text-baylor-green mr-4" />
                    <span className="text-gray-700">{formatPhoneNumber(faculty.phone)}</span>
                </div>
                <div className="flex items-center">
                    <Building size={18} className="text-baylor-green mr-4" />
                    <span className="text-gray-700">{faculty.office || 'Not specified'}</span>
                </div>
            </div>
        </div>
    </div>
);


const FacultyDirectory = ({ facultyData, onUpdate }) => {
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [filterText, setFilterText] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'ascending' });
  const [selectedFacultyForCard, setSelectedFacultyForCard] = useState(null);

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
  
  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };
  
  const sortedAndFilteredData = useMemo(() => {
    let data = [...facultyData];

    if (filterText) {
      const lowercasedFilter = filterText.toLowerCase();
      data = data.filter(item =>
        item.name?.toLowerCase().includes(lowercasedFilter) ||
        item.email?.toLowerCase().includes(lowercasedFilter) ||
        item.phone?.toLowerCase().includes(lowercasedFilter) ||
        item.office?.toLowerCase().includes(lowercasedFilter)
      );
    }

    data.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });

    return data;
  }, [facultyData, filterText, sortConfig]);

  const SortableHeader = ({ label, columnKey }) => {
    const isSorted = sortConfig.key === columnKey;
    const directionIcon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : <ArrowUpDown size={14} className="opacity-30" />;
    
    return (
      <th className="px-4 py-3 text-left font-serif font-semibold text-baylor-green">
        <button className="flex items-center gap-2" onClick={() => handleSort(columnKey)}>
            {label}
            {directionIcon}
        </button>
      </th>
    );
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-serif font-semibold text-baylor-green flex items-center border-b border-baylor-gold pb-2">
            <BookUser className="mr-2 text-baylor-gold" size={20} />
            Faculty Directory
          </h2>
          <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                  type="text"
                  placeholder="Filter directory..."
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  className="w-full pl-10 p-2 border border-gray-300 rounded-lg focus:ring-baylor-green focus:border-baylor-green"
              />
          </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-baylor-green/5">
                <SortableHeader label="Name" columnKey="name" />
                <SortableHeader label="Adjunct" columnKey="isAdjunct" />
                <SortableHeader label="Email" columnKey="email" />
                <SortableHeader label="Phone" columnKey="phone" />
                <SortableHeader label="Office" columnKey="office" />
                <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sortedAndFilteredData.map(faculty => (
              <tr key={faculty.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => editingId !== faculty.id && setSelectedFacultyForCard(faculty)}>
                {editingId === faculty.id ? (
                  <>
                    <td className="p-2 text-gray-700 font-medium">{faculty.name}</td>
                    <td className="p-2">
                      <input type="checkbox" name="isAdjunct" checked={!!editFormData.isAdjunct} onChange={handleChange} className="h-4 w-4 rounded border-gray-300 text-baylor-green focus:ring-baylor-green" />
                    </td>
                    <td className="p-2">
                      <input name="email" value={editFormData.email || ''} onChange={handleChange} className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10" placeholder="email@baylor.edu" />
                    </td>
                    <td className="p-2">
                      <input name="phone" value={editFormData.phone || ''} onChange={handleChange} className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10" placeholder="10 digits" />
                    </td>
                    <td className="p-2">
                        <input name="office" value={editFormData.office || ''} onChange={handleChange} className="w-full p-1 border border-baylor-gold rounded bg-baylor-gold/10" placeholder="Building & Room" />
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
                    <td className="px-4 py-3 text-gray-700">{formatPhoneNumber(faculty.phone)}</td>
                    <td className="px-4 py-3 text-gray-700">{faculty.office || '-'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={(e) => { e.stopPropagation(); handleEdit(faculty); }} className="p-2 text-blue-600 hover:bg-blue-100 rounded-full"><Edit size={16} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedFacultyForCard && <FacultyContactCard faculty={selectedFacultyForCard} onClose={() => setSelectedFacultyForCard(null)} />}
    </div>
  );
};

export default FacultyDirectory;
import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, 
  Clock, 
  Filter, 
  Search, 
  Calendar,
  User,
  Database,
  Trash2,
  Edit,
  Plus,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { formatChangeForDisplay, groupChangesByDate, getChangeSummary } from '../utils/recentChanges';

const RecentChangesPage = ({ recentChanges = [], onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAction, setSelectedAction] = useState('all');
  const [selectedCollection, setSelectedCollection] = useState('all');
  const [selectedSource, setSelectedSource] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Get summary statistics
  const summary = useMemo(() => getChangeSummary(recentChanges), [recentChanges]);

  // Filter changes based on search and filters
  const filteredChanges = useMemo(() => {
    return recentChanges.filter(change => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          change.entity?.toLowerCase().includes(searchLower) ||
          change.action?.toLowerCase().includes(searchLower) ||
          change.collection?.toLowerCase().includes(searchLower) ||
          change.source?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }

      // Action filter
      if (selectedAction !== 'all' && change.action !== selectedAction) {
        return false;
      }

      // Collection filter
      if (selectedCollection !== 'all' && change.collection !== selectedCollection) {
        return false;
      }

      // Source filter
      if (selectedSource !== 'all') {
        const displaySource = change.source?.split(' - ')[0]?.replace(/.*\//, '').replace('.jsx', '').replace('.js', '');
        if (displaySource !== selectedSource) {
          return false;
        }
      }

      return true;
    });
  }, [recentChanges, searchTerm, selectedAction, selectedCollection, selectedSource]);

  // Group filtered changes by date
  const groupedChanges = useMemo(() => groupChangesByDate(filteredChanges), [filteredChanges]);

  // Get unique values for filters
  const uniqueActions = [...new Set(recentChanges.map(c => c.action))].sort();
  const uniqueCollections = [...new Set(recentChanges.map(c => c.collection))].sort();
  const uniqueSources = [...new Set(recentChanges.map(c => {
    return c.source?.split(' - ')[0]?.replace(/.*\//, '').replace('.jsx', '').replace('.js', '') || 'Unknown';
  }))].sort();

  const getActionIcon = (action) => {
    switch (action) {
      case 'CREATE': return <Plus className="w-4 h-4" />;
      case 'UPDATE': return <Edit className="w-4 h-4" />;
      case 'DELETE': return <Trash2 className="w-4 h-4" />;
      case 'IMPORT': return <Database className="w-4 h-4" />;
      case 'STANDARDIZE': return <RefreshCw className="w-4 h-4" />;
      case 'MERGE': return <BarChart3 className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => onNavigate('dashboard')}
            className="btn-ghost p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recent Changes</h1>
            <p className="text-gray-600 mt-1">
              Complete audit trail of all data modifications
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="btn-secondary flex items-center space-x-2"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Changes</p>
                <p className="text-2xl font-bold text-gray-900">{summary.total}</p>
              </div>
              <Clock className="w-8 h-8 text-baylor-green" />
            </div>
          </div>
        </div>
        
        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Today</p>
                <p className="text-2xl font-bold text-gray-900">{summary.today}</p>
              </div>
              <Calendar className="w-8 h-8 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">This Week</p>
                <p className="text-2xl font-bold text-gray-900">{summary.thisWeek}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-600" />
            </div>
          </div>
        </div>
        
        <div className="university-card">
          <div className="university-card-content">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Filtered</p>
                <p className="text-2xl font-bold text-gray-900">{filteredChanges.length}</p>
              </div>
              <Filter className="w-8 h-8 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="university-card">
        <div className="university-card-content">
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search changes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-field pl-10"
              />
            </div>

            {/* Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Action</label>
                  <select
                    value={selectedAction}
                    onChange={(e) => setSelectedAction(e.target.value)}
                    className="input-field"
                  >
                    <option value="all">All Actions</option>
                    {uniqueActions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Collection</label>
                  <select
                    value={selectedCollection}
                    onChange={(e) => setSelectedCollection(e.target.value)}
                    className="input-field"
                  >
                    <option value="all">All Collections</option>
                    {uniqueCollections.map(collection => (
                      <option key={collection} value={collection}>{collection}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Source</label>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="input-field"
                  >
                    <option value="all">All Sources</option>
                    {uniqueSources.map(source => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Changes List */}
      <div className="space-y-6">
        {Object.keys(groupedChanges).length > 0 ? (
          Object.entries(groupedChanges).map(([date, changes]) => (
            <div key={date} className="university-card">
              <div className="university-card-header">
                <h3 className="university-card-title">{date}</h3>
                <span className="text-sm text-gray-500">{changes.length} change{changes.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="university-card-content">
                <div className="space-y-3">
                  {changes.map((change, index) => (
                    <div key={change.id || index} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg">
                      <div className={`p-2 rounded-full ${change.actionColor.replace('text-', 'bg-').replace('-600', '-100')}`}>
                        {getActionIcon(change.action)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              <span className={`${change.actionColor} font-semibold`}>
                                {change.displayAction}
                              </span>
                              {' '}- {change.displayEntity}
                            </p>
                            {change.detailedDescription && (
                              <p className="text-sm text-gray-700 mt-1 bg-gray-100 rounded px-2 py-1">
                                {change.detailedDescription}
                              </p>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                              Collection: {change.collection} • Source: {change.displaySource}
                            </p>
                            {change.metadata && change.metadata.fieldChanges && Object.keys(change.metadata.fieldChanges).length > 0 && (
                              <div className="mt-2">
                                <details className="text-xs">
                                  <summary className="text-gray-600 cursor-pointer hover:text-gray-800">
                                    View detailed changes ({Object.keys(change.metadata.fieldChanges).length} field{Object.keys(change.metadata.fieldChanges).length !== 1 ? 's' : ''})
                                  </summary>
                                  <div className="mt-2 space-y-1 pl-4 border-l-2 border-gray-200">
                                    {Object.entries(change.metadata.fieldChanges).map(([field, fieldChange]) => (
                                      <div key={field} className="text-xs">
                                        <span className="font-medium text-gray-700">{field}:</span>
                                        {fieldChange.type === 'added' && (
                                          <span className="text-green-600 ml-1">
                                            Added "{fieldChange.to}"
                                          </span>
                                        )}
                                        {fieldChange.type === 'removed' && (
                                          <span className="text-red-600 ml-1">
                                            Removed "{fieldChange.from}"
                                          </span>
                                        )}
                                        {fieldChange.type === 'modified' && (
                                          <span className="text-blue-600 ml-1">
                                            "{fieldChange.from}" → "{fieldChange.to}"
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            )}
                            {change.metadata && Object.keys(change.metadata).length > 0 && !change.metadata.fieldChanges && (
                              <div className="mt-2 text-xs text-gray-600">
                                {Object.entries(change.metadata).map(([key, value]) => (
                                  <span key={key} className="inline-block mr-4">
                                    {key}: {String(value)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-gray-500">{change.timeAgo}</p>
                            <p className="text-xs text-gray-400">
                              {new Date(change.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="university-card">
            <div className="university-card-content">
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No changes found</h3>
                <p className="text-gray-500">
                  {searchTerm || selectedAction !== 'all' || selectedCollection !== 'all' || selectedSource !== 'all'
                    ? 'Try adjusting your search criteria or filters.'
                    : 'No changes have been recorded yet.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecentChangesPage;
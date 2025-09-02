import React from 'react';
import { ArrowLeft, ExternalLink, Settings, GraduationCap, Calendar, IdCard, BookOpen } from 'lucide-react';

const SystemsPage = ({ onNavigate }) => {
  const systems = [
    { 
      name: 'Schedule of Classes', 
      description: 'Official University course schedule and enrollment system',
      url: 'https://www1.baylor.edu/scheduleofclasses/',
      icon: Calendar,
      category: 'Academic',
      color: 'bg-baylor-green'
    },
    { 
      name: 'CLSS', 
      description: 'Course Listing and Schedule System for faculty and staff',
      url: 'https://registrar.web.baylor.edu/courses-catalogs/clss-class-scheduling-facultystaff',
      icon: BookOpen,
      category: 'Academic',
      color: 'bg-baylor-green'
    },
    { 
      name: 'ChairSIS', 
      description: 'Program Management and Administrative System',
      url: 'https://www1.baylor.edu/ChairSIS/',
      icon: Settings,
      category: 'Administrative',
      color: 'bg-baylor-green'
    },
    { 
      name: 'Canvas', 
      description: 'Learning Management System for courses and content',
      url: 'https://canvas.baylor.edu/',
      icon: GraduationCap,
      category: 'Academic',
      color: 'bg-baylor-gold'
    },
    { 
      name: 'CSGold', 
      description: 'ID Card System for campus identification and access',
      url: 'https://idcard.baylor.edu',
      icon: IdCard,
      category: 'Campus Services',
      color: 'bg-baylor-gold'
    }
  ];

  const categories = [...new Set(systems.map(system => system.category))];

  const SystemCard = ({ system }) => {
    const Icon = system.icon;
    
    return (
      <a
        href={system.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block p-6 bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 hover:border-baylor-green/30"
      >
        <div className="flex items-start space-x-4">
          <div className={`p-3 ${system.color} rounded-lg group-hover:scale-110 transition-transform duration-200`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 group-hover:text-baylor-green transition-colors">
                {system.name}
              </h3>
              <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-baylor-green transition-colors" />
            </div>
            
            <p className="text-gray-600 mt-1 text-sm leading-relaxed">
              {system.description}
            </p>
            
            <div className="mt-3 flex items-center">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                {system.category}
              </span>
              <span className="ml-3 text-xs text-baylor-green font-medium group-hover:underline">
                Visit System →
              </span>
            </div>
          </div>
        </div>
      </a>
    );
  };

  const CategorySection = ({ category, systemsInCategory }) => (
    <div className="space-y-4">
      <h2 className="text-lg font-serif font-semibold text-baylor-green border-b border-baylor-gold/30 pb-2">
        {category} Systems
      </h2>
      <div className="grid gap-4">
        {systemsInCategory.map((system) => (
          <SystemCard key={system.name} system={system} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back Navigation */}
      <button 
        onClick={() => onNavigate('dashboard')}
        className="flex items-center text-baylor-green hover:text-baylor-green/80 transition-colors font-medium"
      >
        <ArrowLeft size={20} className="mr-2" />
        Back to Dashboard
      </button>

      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">University Systems</h1>
        <p className="text-gray-600">Access official Baylor University tools and resources</p>
      </div>

      {/* Quick Access Banner */}
      <div className="university-header rounded-xl p-8">
        <div className="university-brand">
          <div className="university-logo">
            <Settings className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="university-title">Official University Resources</h2>
            <p className="university-subtitle">
              Direct links to essential Baylor systems for faculty and staff
            </p>
          </div>
        </div>
      </div>

      {/* Systems Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Academic Systems</h3>
          <p className="text-sm text-gray-600">Course management, scheduling, and learning platforms</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Settings className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Administrative</h3>
                          <p className="text-sm text-gray-600">Program management and administrative tools</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
          <div className="w-12 h-12 bg-baylor-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <IdCard className="w-6 h-6 text-baylor-green" />
          </div>
          <h3 className="font-semibold text-gray-900 mb-2">Campus Services</h3>
          <p className="text-sm text-gray-600">ID cards, access control, and campus utilities</p>
        </div>
      </div>

      {/* Systems by Category */}
      <div className="space-y-8">
        {categories.map(category => (
          <CategorySection
            key={category}
            category={category}
            systemsInCategory={systems.filter(system => system.category === category)}
          />
        ))}
      </div>

      {/* Important Notice */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ExternalLink className="w-5 h-5 text-amber-600" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-amber-800 mb-1">
              External Systems Notice
            </h3>
            <p className="text-sm text-amber-700">
              These links will open in new tabs and direct you to official Baylor University systems. 
              You may need to authenticate with your Baylor credentials to access certain resources. 
              For technical support with these systems, please contact the appropriate Baylor IT department.
            </p>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-serif font-semibold text-baylor-green mb-4">
          Need Help?
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">IT Support</h3>
            <p className="text-sm text-gray-600 mb-3">
              For technical issues with university systems, contact Baylor IT Services.
            </p>
            <a 
              href="https://www.baylor.edu/its/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm text-baylor-green hover:underline font-medium"
            >
              Visit Baylor IT Services →
            </a>
          </div>
          
          <div>
            <h3 className="font-medium text-gray-900 mb-2">HSD Dashboard Support</h3>
            <p className="text-sm text-gray-600 mb-3">
              For questions about this HSD Dashboard application, contact Davis! (davis_deaton1@balyor.edu).
            </p>
            <button 
              onClick={() => onNavigate('dashboard')}
              className="text-sm text-baylor-green hover:underline font-medium"
            >
              Return to Dashboard →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemsPage;
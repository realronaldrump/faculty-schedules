/**
 * Parse full name into components.
 */
export const parseFullName = (fullName) => {
  if (!fullName) return { title: '', firstName: '', lastName: '' };

  const name = fullName.trim();
  const parts = name.split(/\s+/);

  // Common titles
  const titles = ['dr', 'dr.', 'mr', 'mr.', 'mrs', 'mrs.', 'ms', 'ms.', 'miss', 'prof', 'professor'];

  let title = '';
  let firstName = '';
  let lastName = '';

  let nameStart = 0;

  // Check for title
  if (parts.length > 1 && titles.includes(parts[0].toLowerCase())) {
    title = parts[0];
    nameStart = 1;
  }

  if (parts.length > nameStart) {
    if (parts.length === nameStart + 1) {
      // Only one name part after title
      lastName = parts[nameStart];
    } else if (parts.length === nameStart + 2) {
      // First and last name
      firstName = parts[nameStart];
      lastName = parts[nameStart + 1];
    } else {
      // Multiple parts - take first as firstName, rest as lastName
      firstName = parts[nameStart];
      lastName = parts.slice(nameStart + 1).join(' ');
    }
  }

  return {
    title: title,
    firstName: firstName,
    lastName: lastName
  };
};

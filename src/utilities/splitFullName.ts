// Tách full_name -> first/middle/last, copy đúng logic api-core
// (UserService.splitFullName) để payload sync sang chat khớp bản api-core tạo.
export function splitFullName(fullName: string | null | undefined): {
  first_name: string;
  middle_name: string;
  last_name: string;
} {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  switch (parts.length) {
    case 0:
      return { first_name: '', middle_name: '', last_name: '' };
    case 1:
      return { first_name: '', middle_name: '', last_name: parts[0] };
    case 2:
      return { first_name: parts[0], middle_name: '', last_name: parts[1] };
    default:
      return {
        first_name: parts[0],
        middle_name: parts.slice(1, -1).join(' '),
        last_name: parts[parts.length - 1],
      };
  }
}

# Admin Platform Integration Guide

Since you have a separate "Admin Platform" where the Managing Partner creates staff accounts, both platforms need to communicate seamlessly. Here is the architectural guide on how to properly connect the Admin Platform to this "Engine Room" Staff Dashboard.

## 1. Share the Same Supabase Project
Both platforms must point to the exact same Supabase database instance. Ensure the `.env` file in your Admin Platform matches this one:

```env
# In Admin Platform .env
SUPABASE_URL="YOUR_SUPABASE_PROJECT_URL"
SUPABASE_SERVICE_ROLE_KEY="YOUR_SUPABASE_SERVICE_KEY"
```

## 2. Password Hashing (Critical)
Because the Staff Dashboard implements its own JWT-based authentication checking the `password_hash` column in the `staff` table, the Admin Platform **must** use the same hashing algorithm (`bcrypt`) when creating or updating a staff member.

If the Admin Platform stores plaintext passwords or uses a different hash, the staff will not be able to log in to the Dashboard.

### Node.js Example for the Admin Platform:
When the admin creates a new staff member, the backend of the Admin Platform should do something like this:

```javascript
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function createStaffAccount(firmId, name, username, plainTextPassword, role) {
  // 1. Hash the password with bcrypt (10 salt rounds)
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(plainTextPassword, saltRounds);

  // 2. Insert into the shared 'staff' table
  const { data, error } = await supabase
    .from('staff')
    .insert([{
      firm_id: firmId,
      name: name,
      username: username,
      password_hash: passwordHash,
      role: role,
      status: 'active', // Set to active so they can log in immediately
      accessible_menus: ['cases', 'diary'], // default permissions
      case_access_mode: 'assigned'
    }]);

  if (error) console.error("Error creating staff:", error);
  return data;
}
```

## 3. Firm ID Architecture (Multi-Tenancy)
Whenever the Admin Platform creates a staff member, it must associate them with a `firm_id`. 
When the staff logs into this Dashboard, the backend extracts that `firm_id` and attaches it to their authentication token. This ensures querying cases, files, and events are strictly locked to their firm:

```javascript
// Example secure query in this Dashboard
const { data } = await supabase
  .from('cases')
  .select('*')
  .eq('firm_id', user.firm_id); // The firm_id is pulled directly from the staff's auth token
```

## 4. Role Management & Enforcement (Managing Partner vs Associate)

The system relies on a strict **Role-Based Access Control (RBAC)** flow bridging both platforms:

### A. Database Strictness (The Foundation)
In the shared Supabase database, the `staff` table has a strict `CHECK` constraint on the `role` column:
`role TEXT NOT NULL CHECK (role IN ('Managing Partner', 'Associate', 'Advocate', 'Intern', 'Clerk', 'Secretary'))`

When the Admin Platform creates a staff member, it **must** push one of these exact string values. If the Admin Platform attempts to send an invalid role (like 'Boss' or 'Paralegal'), the database will reject the insertion.

### B. The Login Flow (The Handshake)
When staff log into this "Engine Room" dashboard:
1. The backend verifies their username and password.
2. It fetches their profile from the database, which includes their `role`.
3. The system creates a secure **JSON Web Token (JWT)** that permanently embeds their role for that session:
   `jwt.sign({ id: staff.id, firm_id: staff.firm_id, role: staff.role }, JWT_SECRET)`

### C. Backend API Enforcement (The Shield)
The backend routes in the Engine Room do not trust the frontend. When a request is made to view or change permissions, the server checks the JWT.
For example, in the Matrix update route:
```javascript
const userRole = req.user.role; // Extracted safely from the JWT token
if (userRole !== 'Managing Partner') {
    return res.status(403).json({ error: "Unauthorized" });
}
```

### D. Frontend UX (The Interface)
Finally, the React frontend reads this role to customize the UI:
- **Navigation:** The `canAccess` function automatically returns `true` for all menus if `user.role === 'Managing Partner'`.
- **Admin Matrix:** The `/admin` UI completely blocks rendering if the role isn't 'Managing Partner'.
- **Cases:** If `role === 'Managing Partner'`, the backend forcefully sets `case_access_mode` to `'all'`, ignoring any lesser assigned permissions.

## 5. Alternative: Supabase Auth (Recommended if applicable)
If you haven't fully committed to the custom `password_hash` column, an industry-standard approach is to use built-in **Supabase Authentication**.
1. Admin Platform invites a user via `supabase.auth.admin.inviteUserByEmail()`.
2. A PostgreSQL trigger automatically creates a row in the `staff` table.
3. The Staff Dashboard logs them in using standard Supabase Auth sessions.

*If you prefer the custom bcrypt approach to avoid using emails (e.g. using usernames like 'johndoe' instead of 'john.doe@lawfirm.com'), stick perfectly to Step 2!*

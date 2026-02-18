import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { User, Mail, Phone, MapPin, Save, LogOut } from 'lucide-react';
import './Settings.css';

export default function Settings() {
  const { user, logout, updateProfile } = useAuth();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || '',
    contactNumber: user?.contactNumber || '',
    municipality: user?.municipality || '',
    province: user?.province || '',
  });
  const [saved, setSaved] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setSaved(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const success = await updateProfile(form);
    if (success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>Manage your account and preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile Card */}
        <div className="settings-card profile-card">
          <div className="profile-avatar">
            <User size={40} />
          </div>
          <h3>{user?.firstName} {user?.lastName}</h3>
          <span className="profile-username">@{user?.username}</span>
          <span className="profile-role">Farm Manager</span>
        </div>

        {/* Edit Profile Form */}
        <form className="settings-card settings-form" onSubmit={handleSave}>
          <h2>Edit Profile</h2>

          <div className="settings-form-grid">
            <div className="settings-field">
              <label><User size={14} /> First Name</label>
              <input
                name="firstName"
                value={form.firstName}
                onChange={handleChange}
                placeholder="First Name"
              />
            </div>

            <div className="settings-field">
              <label><User size={14} /> Last Name</label>
              <input
                name="lastName"
                value={form.lastName}
                onChange={handleChange}
                placeholder="Last Name"
              />
            </div>

            <div className="settings-field">
              <label><Mail size={14} /> Email</label>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="Email"
              />
            </div>

            <div className="settings-field">
              <label><Phone size={14} /> Contact Number</label>
              <input
                name="contactNumber"
                value={form.contactNumber}
                onChange={handleChange}
                placeholder="Contact Number"
              />
            </div>

            <div className="settings-field">
              <label><MapPin size={14} /> Municipality</label>
              <input
                name="municipality"
                value={form.municipality}
                onChange={handleChange}
                placeholder="Municipality"
              />
            </div>

            <div className="settings-field">
              <label><MapPin size={14} /> Province</label>
              <input
                name="province"
                value={form.province}
                onChange={handleChange}
                placeholder="Province"
              />
            </div>
          </div>

          <div className="settings-actions">
            <button type="submit" className="btn-save">
              <Save size={16} /> Save Changes
            </button>
            {saved && <span className="save-success">✓ Saved successfully!</span>}
          </div>
        </form>

        {/* Account Actions */}
        <div className="settings-card">
          <h2>Account</h2>
          <p className="settings-desc">Manage your account settings and session.</p>

          <button className="btn-logout" onClick={logout}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

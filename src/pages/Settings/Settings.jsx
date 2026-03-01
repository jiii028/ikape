import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { User, Mail, Phone, MapPin, Save, LogOut, Calendar, KeyRound } from 'lucide-react'
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog'
import ForgotPasswordModal from '../../components/ForgotPasswordModal/ForgotPasswordModal'
import SystemFlowGuide from '../../components/SystemFlowGuide/SystemFlowGuide'

export default function Settings() {
  const { user, logout, updateProfile, requestPasswordReset } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    middleInitial: user?.middleInitial || '',
    lastName: user?.lastName || '',
    age: user?.age || '',
    email: user?.email || '',
    contactNumber: user?.contactNumber || '',
    municipality: user?.municipality || '',
    province: user?.province || '',
  })
  const [saved, setSaved] = useState(false)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [saveConfirm, setSaveConfirm] = useState(false)
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false)

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value })
    setSaved(false)
  }

  const handleSave = (event) => {
    event.preventDefault()
    setSaveConfirm(true)
  }

  const doSave = async () => {
    const success = await updateProfile(form)
    if (success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <div>
          <h1>Settings</h1>
          <p>Manage your account and preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card profile-card">
          <div className="profile-avatar">
            <User size={40} />
          </div>
          <h3>
            {user?.firstName}
            {user?.middleInitial ? ` ${user.middleInitial}.` : ''}{' '}
            {user?.lastName}
          </h3>
          <span className="profile-username">@{user?.username}</span>
          <span className="profile-role">Farm Manager</span>

          <div className="profile-details">
            {user?.age && (
              <div className="profile-detail-item">
                <Calendar size={13} />
                <span className="detail-label">Age</span>
                <span className="detail-value">{user.age}</span>
              </div>
            )}
            <div className="profile-detail-item">
              <Mail size={13} />
              <span className="detail-label">Email</span>
              <span className="detail-value">{user?.email || '-'}</span>
            </div>
            <div className="profile-detail-item">
              <Phone size={13} />
              <span className="detail-label">Contact</span>
              <span className="detail-value">{user?.contactNumber || '-'}</span>
            </div>
            <div className="profile-detail-item">
              <MapPin size={13} />
              <span className="detail-label">Municipality</span>
              <span className="detail-value">{user?.municipality || '-'}</span>
            </div>
            <div className="profile-detail-item">
              <MapPin size={13} />
              <span className="detail-label">Province</span>
              <span className="detail-value">{user?.province || '-'}</span>
            </div>
          </div>
        </div>

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
              <label><User size={14} /> Middle Initial</label>
              <input
                name="middleInitial"
                value={form.middleInitial}
                onChange={handleChange}
                placeholder="M.I."
                maxLength={2}
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
              <label><Calendar size={14} /> Age</label>
              <input
                name="age"
                type="number"
                min="1"
                max="150"
                value={form.age}
                onChange={handleChange}
                placeholder="Age"
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
            {saved && <span className="save-success">Saved successfully!</span>}
          </div>
        </form>

        <div className="settings-card">
          <h2>Account</h2>
          <p className="settings-desc">Manage your account settings and session.</p>

          <div className="account-actions">
            <button className="btn-forgot-password" onClick={() => setForgotPasswordOpen(true)}>
              <KeyRound size={16} /> Forgot Password
            </button>

            <button className="btn-logout" onClick={() => setLogoutConfirm(true)}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        </div>
      </div>

      <SystemFlowGuide mode="monitoring" />

      <ConfirmDialog
        isOpen={saveConfirm}
        onClose={() => setSaveConfirm(false)}
        onConfirm={doSave}
        title="Save Profile?"
        message="Save your updated profile information?"
        confirmText="Save"
        cancelText="Go Back"
        variant="success"
      />

      <ConfirmDialog
        isOpen={logoutConfirm}
        onClose={() => setLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Log out of your account?"
        message="Your current session will end on this device."
        confirmText="Log Out"
        cancelText="Cancel"
        variant="warning"
      />

      <ForgotPasswordModal
        isOpen={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
        onSubmit={requestPasswordReset}
        defaultEmail={form.email || user?.email || ''}
      />
    </div>
  )
}

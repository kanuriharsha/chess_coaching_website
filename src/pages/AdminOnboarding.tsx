import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Crown, ChevronRight, ChevronLeft, Clock, CheckCircle2, XCircle, RefreshCw, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

interface AdminOnboardingForm {
  // Step 1: Personal
  fullName: string;
  email: string;
  phone: string;
  gender: string;
  dateOfBirth: string;
  // Step 2: Chess & Location
  chessTitle: string;
  fideId: string;
  village: string;
  state: string;
  country: string;
  // Step 3: Account
  username: string;
  password: string;
  confirmPassword: string;
}

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status tracking: 'form' | 'under_review' | 'verified' | 'rejected'
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [trackedUsername, setTrackedUsername] = useState<string>('');
  const [adminDetails, setAdminDetails] = useState<any>(null);

  const [formData, setFormData] = useState<AdminOnboardingForm>({
    fullName: '',
    email: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    chessTitle: '',
    fideId: '',
    village: '',
    state: '',
    country: '',
    username: '',
    password: '',
    confirmPassword: '',
  });

  // On page load/refresh: check if user has a pending or active admin request in localStorage
  useEffect(() => {
    const savedUsername = localStorage.getItem('chessCoach_pendingAdminUsername');
    if (savedUsername) {
      setTrackedUsername(savedUsername);
      checkStatus(savedUsername);
    }
  }, []);

  const checkStatus = async (usernameToCheck?: string) => {
    const targetUser = usernameToCheck || trackedUsername;
    if (!targetUser) return;

    setIsCheckingStatus(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin-status/${encodeURIComponent(targetUser)}`);
      if (response.ok) {
        const data = await response.json();
        setVerificationStatus(data.verificationStatus || 'under_review');
        setAdminDetails(data);
      } else if (response.status === 404) {
        // Request no longer exists or removed
        setVerificationStatus(null);
        localStorage.removeItem('chessCoach_pendingAdminUsername');
      }
    } catch (error) {
      console.error('Error checking verification status:', error);
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const isStep1Valid = () => {
    return (
      formData.fullName.trim() !== '' &&
      formData.email.trim() !== '' &&
      formData.phone.trim() !== '' &&
      formData.gender.trim() !== '' &&
      formData.dateOfBirth.trim() !== ''
    );
  };

  const isStep2Valid = () => {
    return (
      formData.village.trim() !== '' &&
      formData.state.trim() !== '' &&
      formData.country.trim() !== ''
    );
  };

  const isStep3Valid = () => {
    return (
      formData.username.trim() !== '' &&
      formData.password.trim() !== '' &&
      formData.confirmPassword.trim() !== '' &&
      formData.password === formData.confirmPassword
    );
  };

  const nextStep = () => {
    if (step === 1 && !isStep1Valid()) {
      toast.error('Please complete all required fields in Personal Information.');
      return;
    }
    if (step === 2 && !isStep2Valid()) {
      toast.error('Please complete Village, State, and Country fields.');
      return;
    }
    if (step < 3) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      navigate('/login');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isStep1Valid() || !isStep2Valid() || !isStep3Valid()) {
      toast.error('Please verify all required fields are filled correctly.');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match. Please recheck.');
      return;
    }

    if (formData.password.length < 4) {
      toast.error('Password should be at least 4 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/auth/admin-onboarding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          gender: formData.gender,
          dateOfBirth: formData.dateOfBirth,
          chessTitle: formData.chessTitle,
          fideId: formData.fideId,
          village: formData.village,
          state: formData.state,
          country: formData.country,
          username: formData.username,
          password: formData.password
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Registration submitted for verification!');
        const submittedUsername = data.username || formData.username;
        localStorage.setItem('chessCoach_pendingAdminUsername', submittedUsername);
        setTrackedUsername(submittedUsername);
        setVerificationStatus('under_review');
        setAdminDetails({
          username: submittedUsername,
          role: 'admin',
          verificationStatus: 'under_review',
          profile: {
            fullName: formData.fullName,
            email: formData.email,
            phone: formData.phone,
            chessTitle: formData.chessTitle,
            village: formData.village,
            state: formData.state,
            country: formData.country
          }
        });
      } else {
        toast.error(data.message || 'Failed to submit registration. Please try again.');
      }
    } catch (error) {
      console.error('Submission error:', error);
      toast.error('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetApplication = () => {
    localStorage.removeItem('chessCoach_pendingAdminUsername');
    setVerificationStatus(null);
    setTrackedUsername('');
    setAdminDetails(null);
    setStep(1);
    setFormData({
      fullName: '',
      email: '',
      phone: '',
      gender: '',
      dateOfBirth: '',
      chessTitle: '',
      fideId: '',
      village: '',
      state: '',
      country: '',
      username: '',
      password: '',
      confirmPassword: '',
    });
  };

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://harshachess.vercel.app';

  // ==========================================
  // Processing & Verification Status Views
  // ==========================================
  if (verificationStatus === 'under_review') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg animate-fade-in">
          {/* Card */}
          <div className="card-premium p-8 text-center border-amber-500/30 relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl" />
            <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-primary/10 rounded-full blur-2xl" />

            {/* Glowing Icon */}
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-6 text-amber-500 shadow-lg relative">
              <Clock className="w-10 h-10 animate-pulse text-amber-500" />
            </div>

            {/* Status Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-semibold mb-4 uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Status: under review
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">
              Submitted for verification!
            </h1>

            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mb-6">
              Your profile is under review. We'll notify you once verified. This usually takes 15-20 minutes
            </p>

            <div className="bg-secondary/50 rounded-xl p-4 mb-6 border border-border text-left space-y-2">
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Account Username:</span>
                <span className="font-semibold text-foreground">{trackedUsername}</span>
              </div>
              {adminDetails?.profile?.fullName && (
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>Applicant Name:</span>
                  <span className="font-medium text-foreground">{adminDetails.profile.fullName}</span>
                </div>
              )}
              {adminDetails?.profile?.email && (
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>Email ID:</span>
                  <span className="font-medium text-foreground">{adminDetails.profile.email}</span>
                </div>
              )}
            </div>

            <p className="text-xs md:text-sm text-muted-foreground mb-6">
              if your profile verified check logging in{' '}
              <a 
                href={currentOrigin} 
                className="text-primary font-medium hover:underline inline-flex items-center gap-1"
                target="_blank" 
                rel="noreferrer"
              >
                {currentOrigin}
              </a>
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => checkStatus()}
                disabled={isCheckingStatus}
                className="flex-1 py-3 px-4 rounded-xl border border-border bg-card text-foreground font-medium hover:bg-secondary transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                {isCheckingStatus ? 'Checking...' : 'Refresh Status'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/login')}
                className="flex-1 btn-premium flex items-center justify-center gap-2"
              >
                Go to Sign In
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-border/50 flex justify-center">
              <button
                type="button"
                onClick={handleResetApplication}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Submit another request with different account
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'verified') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="card-premium p-8 text-center border-emerald-500/30 relative overflow-hidden">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-6 text-emerald-500 shadow-lg">
              <ShieldCheck className="w-10 h-10 text-emerald-500" />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-4 uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              Status: Verified
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">
              Welcome to <span className="text-primary">{currentOrigin}</span>
            </h1>

            <p className="text-foreground font-medium text-base md:text-lg mb-2">
              Your profile is verified
            </p>

            <p className="text-muted-foreground text-sm mb-8">
              Your administrator account has been approved by the superadmin. You can now log in with your credentials to access the admin portal.
            </p>

            <button
              type="button"
              onClick={() => {
                localStorage.removeItem('chessCoach_pendingAdminUsername');
                navigate('/login');
              }}
              className="btn-premium w-full flex items-center justify-center gap-2 py-3.5 text-base"
            >
              Sign In to Admin Portal
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'rejected') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="card-premium p-8 text-center border-destructive/30">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-destructive/10 border border-destructive/30 mb-6 text-destructive shadow-lg">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>

            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-destructive/10 border border-destructive/30 text-destructive text-xs font-semibold mb-4 uppercase tracking-wider">
              Status: Rejected
            </div>

            <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground mb-3">
              Application Not Approved
            </h1>

            <p className="text-muted-foreground text-sm mb-6">
              Your admin onboarding registration request was not approved by the superadmin. If you believe this was an error, please reach out to the coaching administrator.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleResetApplication}
                className="flex-1 btn-premium"
              >
                Submit New Application
              </button>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary"
              >
                Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 3-Step Admin Registration Form
  // ==========================================
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-xl animate-fade-in">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-3 shadow-premium">
            <Crown className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
            Admin Onboarding
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Register your administrator profile for coaching management
          </p>
        </div>

        {/* Step Progress Indicators */}
        <div className="flex items-center justify-center gap-2 md:gap-4 mb-8 px-2">
          {[
            { num: 1, label: 'Personal Info' },
            { num: 2, label: 'Chess & Location' },
            { num: 3, label: 'Account Details' },
          ].map((item) => (
            <div key={item.num} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  item.num === step
                    ? 'bg-primary text-primary-foreground shadow-md ring-2 ring-primary/30'
                    : item.num < step
                    ? 'bg-primary/20 text-primary border border-primary/40'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {item.num < step ? '✓' : item.num}
              </div>
              <span
                className={`hidden sm:inline text-xs font-medium ${
                  item.num === step ? 'text-foreground font-semibold' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
              {item.num < 3 && (
                <div
                  className={`w-8 sm:w-12 h-1 rounded-full transition-colors ${
                    step > item.num ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <div className="card-premium p-6 md:p-8">
          <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); nextStep(); }}>
            {/* STEP 1: Personal Information */}
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <div className="border-b border-border pb-3 mb-4">
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    1. Personal Information
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Basic identification details for coach verification
                  </p>
                </div>

                <div>
                  <label className="label-premium">Full Name *</label>
                  <input
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter full name"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">Email ID *</label>
                  <input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="coach.email@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">Phone Number *</label>
                  <input
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="+91 XXXXX XXXXX"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label-premium">Gender *</label>
                    <select
                      name="gender"
                      value={formData.gender}
                      onChange={handleChange}
                      className="input-premium"
                      required
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-premium">Date of Birth *</label>
                    <input
                      name="dateOfBirth"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                      className="input-premium"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Chess & Location Information */}
            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <div className="border-b border-border pb-3 mb-4">
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    2. Chess & Location Information
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your chess background and geographic location
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label-premium">Chess Title (Optional)</label>
                    <select
                      name="chessTitle"
                      value={formData.chessTitle}
                      onChange={handleChange}
                      className="input-premium"
                    >
                      <option value="">None / Select Title</option>
                      <option value="GM">GM (Grandmaster)</option>
                      <option value="IM">IM (International Master)</option>
                      <option value="FM">FM (FIDE Master)</option>
                      <option value="CM">CM (Candidate Master)</option>
                      <option value="WGM">WGM (Woman Grandmaster)</option>
                      <option value="WIM">WIM (Woman International Master)</option>
                      <option value="WFM">WFM (Woman FIDE Master)</option>
                      <option value="WCM">WCM (Woman Candidate Master)</option>
                      <option value="National Master">National Master</option>
                      <option value="FIDE Instructor">FIDE Instructor / Coach</option>
                      <option value="Club Player">Club / Rated Player</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-premium">FIDE ID (Optional)</label>
                    <input
                      name="fideId"
                      value={formData.fideId}
                      onChange={handleChange}
                      className="input-premium"
                      placeholder="e.g. 12345678"
                    />
                  </div>
                </div>

                <div>
                  <label className="label-premium">Village / Town *</label>
                  <input
                    name="village"
                    value={formData.village}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter village, town or city"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="label-premium">State *</label>
                    <input
                      name="state"
                      value={formData.state}
                      onChange={handleChange}
                      className="input-premium"
                      placeholder="Enter state / province"
                      required
                    />
                  </div>

                  <div>
                    <label className="label-premium">Country *</label>
                    <input
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      className="input-premium"
                      placeholder="Enter country"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Account / Login Information */}
            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <div className="border-b border-border pb-3 mb-4">
                  <h2 className="font-serif text-xl font-semibold text-foreground">
                    3. Account / Login Information
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Credentials you will use to sign in once verified
                  </p>
                </div>

                <div>
                  <label className="label-premium">Username *</label>
                  <input
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Choose a unique username"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">Password *</label>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={handleChange}
                      className="input-premium pr-12"
                      placeholder="Create a secure password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label-premium">Confirm Password *</label>
                  <div className="relative">
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className="input-premium pr-12"
                      placeholder="Re-enter your password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {formData.password && formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-xs text-destructive mt-1 font-medium">
                      Passwords do not match
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 mt-8 pt-4 border-t border-border">
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 py-3 px-4 rounded-xl border border-border text-foreground font-medium hover:bg-secondary transition-all flex items-center justify-center gap-2"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={step === 1 ? !isStep1Valid() : !isStep2Valid()}
                  className="flex-1 btn-premium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!isStep3Valid() || isSubmitting}
                  className="flex-1 btn-premium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    'Complete Setup'
                  )}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Existing account footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            Already have an active coach or admin account?{' '}
            <Link to="/login" className="text-primary font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

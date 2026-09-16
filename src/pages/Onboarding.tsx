import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, StudentProfile } from '@/contexts/AuthContext';
import { Crown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const Onboarding = () => {
  const { completeOnboarding } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StudentProfile>({
    fullName: '',
    classDesignation: '',
    phone: '',
    gender: '',
    dateOfBirth: '',
    fatherName: '',
    motherName: '',
    email: '',
    village: '',
    state: '',
    country: '',
    schoolName: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await completeOnboarding(formData);
    toast.success('Profile complete! Welcome to Chess Coach');
    navigate('/puzzles');
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const isStepValid = () => {
    if (step === 1) {
      return formData.fullName && formData.email && formData.phone && formData.gender && formData.dateOfBirth;
    }
    if (step === 2) {
      return formData.fatherName && formData.motherName && formData.classDesignation;
    }
    return formData.village && formData.state && formData.country;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-primary mb-4 shadow-premium">
            <Crown className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Complete Your Profile</h1>
          <p className="text-muted-foreground mt-2">Help us personalize your learning journey</p>
        </div>

        {/* Progress */}
        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-16 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Form Card */}
        <div className="card-premium p-6 md:p-8">
          <form onSubmit={handleSubmit}>
            {step === 1 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-serif text-xl font-semibold mb-4">Personal Information</h3>
                
                <div>
                  <label className="label-premium">Full Name (as per Aadhaar) *</label>
                  <input
                    name="fullName"
                    value={formData.fullName}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter your full name"
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
                    placeholder="your.email@example.com"
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

                <div className="grid grid-cols-2 gap-4">
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

            {step === 2 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-serif text-xl font-semibold mb-4">Family & Education</h3>

                <div>
                  <label className="label-premium">Father's Name *</label>
                  <input
                    name="fatherName"
                    value={formData.fatherName}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter father's name"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">Mother's Name *</label>
                  <input
                    name="motherName"
                    value={formData.motherName}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter mother's name"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">Class / Designation *</label>
                  <input
                    name="classDesignation"
                    value={formData.classDesignation}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="e.g., 8th Grade, College Student"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">School Name (optional)</label>
                  <input
                    name="schoolName"
                    value={formData.schoolName}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter school/institution name"
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 animate-fade-in">
                <h3 className="font-serif text-xl font-semibold mb-4">Location</h3>

                <div>
                  <label className="label-premium">Village / Town *</label>
                  <input
                    name="village"
                    value={formData.village}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter your village or town"
                    required
                  />
                </div>

                <div>
                  <label className="label-premium">State *</label>
                  <input
                    name="state"
                    value={formData.state}
                    onChange={handleChange}
                    className="input-premium"
                    placeholder="Enter your state"
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
                    placeholder="Enter your country"
                    required
                  />
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex gap-3 mt-8">
              {step > 1 && (
                <button
                  type="button"
                  onClick={prevStep}
                  className="flex-1 py-3 px-4 rounded-lg border border-border text-foreground font-medium hover:bg-secondary transition-colors"
                >
                  Back
                </button>
              )}

              {step < 3 ? (
                <button
                  type="button"
                  onClick={nextStep}
                  disabled={!isStepValid()}
                  className="flex-1 btn-premium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!isStepValid()}
                  className="flex-1 btn-premium disabled:opacity-50"
                >
                  Complete Setup
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;

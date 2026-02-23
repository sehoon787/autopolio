import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usersApi, UserProfileUpdate } from '@/api/users'
import { Loader2, Save, Upload, Trash2, User } from 'lucide-react'

export default function ProfileSection() {
  const { t } = useTranslation('settings')
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Form state
  const [displayName, setDisplayName] = useState('')
  const [birthdate, setBirthdate] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')

  // Photo state - store locally until save
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null)
  const [pendingPhotoPreview, setPendingPhotoPreview] = useState<string | null>(null)
  const [pendingPhotoDelete, setPendingPhotoDelete] = useState(false)

  // Track if user has modified any field (to distinguish from default values)
  const [hasModified, setHasModified] = useState(false)

  // Track if form has been initialized (to prevent resetting on photo upload)
  const [isInitialized, setIsInitialized] = useState(false)

  // Fetch profile
  const { data: profileData, isLoading } = useQuery({
    queryKey: ['user-profile', user?.id],
    queryFn: () => usersApi.getProfile(user!.id),
    enabled: !!user?.id,
  })

  // Initialize form from profile data (only on first load)
  // Priority: user-entered value > OAuth default
  useEffect(() => {
    if (profileData?.data && !isInitialized) {
      const profile = profileData.data

      // Use effective values (already calculated by backend)
      // If user has entered a value, use it; otherwise use OAuth default
      setDisplayName(profile.display_name ?? profile.oauth_defaults.name ?? '')
      setProfileEmail(profile.profile_email ?? profile.oauth_defaults.email ?? '')
      setPhone(profile.phone ?? '')
      setAddress(profile.address ?? '')
      setBirthdate(profile.birthdate ?? '')

      // Reset photo pending states
      setPendingPhoto(null)
      setPendingPhotoPreview(null)
      setPendingPhotoDelete(false)

      setHasModified(false)
      setIsInitialized(true)
    }
  }, [profileData, isInitialized])

  // Cleanup preview URL when component unmounts or new photo selected
  useEffect(() => {
    return () => {
      if (pendingPhotoPreview) {
        URL.revokeObjectURL(pendingPhotoPreview)
      }
    }
  }, [pendingPhotoPreview])

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: (data: UserProfileUpdate) =>
      usersApi.updateProfile(user!.id, data),
    onSuccess: () => {
      // Invalidate for background freshness (other components using this query).
      // Do NOT reset isInitialized — the form already shows the correct saved values.
      // Resetting would cause re-initialization from stale cache before refetch completes.
      queryClient.invalidateQueries({ queryKey: ['user-profile', user?.id] })
      setHasModified(false)
      toast({
        title: t('profile.saved'),
      })
    },
    onError: (error: Error) => {
      toast({
        title: t('profile.saveFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Photo upload mutation (called during save)
  const uploadPhotoMutation = useMutation({
    mutationFn: (file: File) => usersApi.uploadPhoto(user!.id, file),
    onError: (error: Error) => {
      toast({
        title: t('profile.photoUploadFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  // Photo delete mutation (called during save)
  const deletePhotoMutation = useMutation({
    mutationFn: () => usersApi.deletePhoto(user!.id),
    onError: (error: Error) => {
      toast({
        title: t('profile.photoDeleteFailed'),
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: t('profile.photoTooLarge'),
          variant: 'destructive',
        })
        return
      }
      // Store file locally and create preview
      if (pendingPhotoPreview) {
        URL.revokeObjectURL(pendingPhotoPreview)
      }
      setPendingPhoto(file)
      setPendingPhotoPreview(URL.createObjectURL(file))
      setPendingPhotoDelete(false)
      setHasModified(true)
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handlePhotoDelete = () => {
    // Mark for deletion (will be applied on save)
    if (pendingPhotoPreview) {
      URL.revokeObjectURL(pendingPhotoPreview)
    }
    setPendingPhoto(null)
    setPendingPhotoPreview(null)
    setPendingPhotoDelete(true)
    setHasModified(true)
  }

  const handleCancelPhotoChange = () => {
    // Cancel pending photo changes
    if (pendingPhotoPreview) {
      URL.revokeObjectURL(pendingPhotoPreview)
    }
    setPendingPhoto(null)
    setPendingPhotoPreview(null)
    setPendingPhotoDelete(false)
    // Only reset hasModified if no other fields were changed
    // For simplicity, we just keep hasModified true - user can save to confirm
  }

  const handleFieldChange = (setter: (value: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    setHasModified(true)
  }

  const handleSave = async () => {
    try {
      // Handle photo changes first
      if (pendingPhotoDelete && profileData?.data?.profile_photo_url) {
        await deletePhotoMutation.mutateAsync()
      } else if (pendingPhoto) {
        await uploadPhotoMutation.mutateAsync(pendingPhoto)
      }

      // Then save profile data
      const data: UserProfileUpdate = {
        display_name: displayName || null,
        birthdate: birthdate || null,
        profile_email: profileEmail || null,
        phone: phone || null,
        address: address || null,
      }
      await updateMutation.mutateAsync(data)

      // Reset photo states after successful save
      if (pendingPhotoPreview) {
        URL.revokeObjectURL(pendingPhotoPreview)
      }
      setPendingPhoto(null)
      setPendingPhotoPreview(null)
      setPendingPhotoDelete(false)
    } catch {
      // Error already handled by mutation onError callbacks
    }
  }

  if (!user) {
    return null
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">{t('profile.title')}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('profile.description')}
        </p>
      </div>

      {/* Form - Order: Photo, Name, Birthdate, Email, Phone, Address */}
      <div className="space-y-6">
        {/* Profile Photo */}
        <div className="space-y-2">
          <Label>{t('profile.photo')}</Label>
          <div className="flex items-center gap-4">
            {/* Photo Preview */}
            <div className="relative w-24 h-24 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-dashed border-muted-foreground/25">
              {/* Show pending photo preview first, then actual photo, then OAuth avatar */}
              {pendingPhotoPreview ? (
                <img
                  src={pendingPhotoPreview}
                  alt="Profile Preview"
                  className="w-full h-full object-cover"
                />
              ) : pendingPhotoDelete ? (
                // Show empty state when photo is marked for deletion
                profileData?.data?.oauth_defaults?.avatar_url ? (
                  <img
                    src={profileData.data.oauth_defaults.avatar_url}
                    alt="GitHub Avatar"
                    className="w-full h-full object-cover opacity-50"
                  />
                ) : (
                  <User className="w-10 h-10 text-muted-foreground" />
                )
              ) : profileData?.data?.profile_photo_url ? (
                <img
                  src={profileData.data.profile_photo_url}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : profileData?.data?.oauth_defaults?.avatar_url ? (
                <img
                  src={profileData.data.oauth_defaults.avatar_url}
                  alt="GitHub Avatar"
                  className="w-full h-full object-cover opacity-50"
                />
              ) : (
                <User className="w-10 h-10 text-muted-foreground" />
              )}
            </div>

            {/* Upload/Delete/Cancel Buttons */}
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-2" />
                {t('profile.uploadPhoto')}
              </Button>
              {/* Show delete button when there's an existing photo or pending photo */}
              {(profileData?.data?.profile_photo_url && !pendingPhotoDelete) || pendingPhotoPreview ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={pendingPhotoPreview ? handleCancelPhotoChange : handlePhotoDelete}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {pendingPhotoPreview ? t('profile.cancelPhoto') : t('profile.deletePhoto')}
                </Button>
              ) : null}
              {/* Show cancel button when photo is marked for deletion */}
              {pendingPhotoDelete && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelPhotoChange}
                  className="text-muted-foreground"
                >
                  {t('profile.cancelDelete')}
                </Button>
              )}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t('profile.photoHint')}
            {(pendingPhoto || pendingPhotoDelete) && (
              <span className="text-primary ml-1">
                ({t('profile.photoChangesPending')})
              </span>
            )}
          </p>
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="displayName">{t('profile.displayName')}</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={handleFieldChange(setDisplayName)}
            placeholder={t('profile.displayNamePlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('profile.displayNameHint')}
          </p>
        </div>

        {/* Birthdate */}
        <div className="space-y-2">
          <Label htmlFor="birthdate">{t('profile.birthdate')}</Label>
          <Input
            id="birthdate"
            type="date"
            value={birthdate}
            onChange={handleFieldChange(setBirthdate)}
          />
        </div>

        {/* Profile Email */}
        <div className="space-y-2">
          <Label htmlFor="profileEmail">{t('profile.profileEmail')}</Label>
          <Input
            id="profileEmail"
            type="email"
            value={profileEmail}
            onChange={handleFieldChange(setProfileEmail)}
            placeholder={t('profile.profileEmailPlaceholder')}
          />
          <p className="text-xs text-muted-foreground">
            {t('profile.profileEmailHint')}
          </p>
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <Label htmlFor="phone">{t('profile.phone')}</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={handleFieldChange(setPhone)}
            placeholder="010-1234-5678"
          />
        </div>

        {/* Address */}
        <div className="space-y-2">
          <Label htmlFor="address">{t('profile.address')}</Label>
          <Input
            id="address"
            value={address}
            onChange={handleFieldChange(setAddress)}
            placeholder={t('profile.addressPlaceholder')}
          />
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || uploadPhotoMutation.isPending || deletePhotoMutation.isPending || !hasModified}
          className="w-full sm:w-auto"
        >
          {(updateMutation.isPending || uploadPhotoMutation.isPending || deletePhotoMutation.isPending) ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {t('profile.save')}
        </Button>
      </div>
    </div>
  )
}

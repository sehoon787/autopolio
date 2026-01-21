import { useState, ReactNode, createContext, useContext } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'

export interface WizardStep {
  id: string
  title: string
  description?: string
  component: ReactNode
  isOptional?: boolean
  canSkip?: boolean
  validate?: () => boolean | Promise<boolean>
}

interface WizardContextType {
  currentStep: number
  totalSteps: number
  nextStep: () => void
  prevStep: () => void
  goToStep: (step: number) => void
  isFirstStep: boolean
  isLastStep: boolean
  canGoNext: boolean
  setCanGoNext: (value: boolean) => void
}

const WizardContext = createContext<WizardContextType | null>(null)

export function useWizard() {
  const context = useContext(WizardContext)
  if (!context) {
    throw new Error('useWizard must be used within a Wizard component')
  }
  return context
}

interface WizardProps {
  steps: WizardStep[]
  onComplete: () => void
  onCancel?: () => void
  completeButtonText?: string
  showStepIndicator?: boolean
  showProgress?: boolean
  allowStepNavigation?: boolean
  className?: string
}

export function Wizard({
  steps,
  onComplete,
  onCancel,
  completeButtonText = '완료',
  showStepIndicator = true,
  showProgress = true,
  allowStepNavigation = false,
  className,
}: WizardProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [canGoNext, setCanGoNext] = useState(true)
  const [isValidating, setIsValidating] = useState(false)

  const totalSteps = steps.length
  const isFirstStep = currentStep === 0
  const isLastStep = currentStep === totalSteps - 1
  const progress = ((currentStep + 1) / totalSteps) * 100

  const nextStep = async () => {
    const currentStepData = steps[currentStep]

    if (currentStepData.validate) {
      setIsValidating(true)
      try {
        const isValid = await currentStepData.validate()
        if (!isValid) {
          setIsValidating(false)
          return
        }
      } catch {
        setIsValidating(false)
        return
      }
      setIsValidating(false)
    }

    if (isLastStep) {
      onComplete()
    } else {
      setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1))
    }
  }

  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0))
  }

  const goToStep = (step: number) => {
    if (allowStepNavigation && step >= 0 && step < totalSteps) {
      setCurrentStep(step)
    }
  }

  const currentStepData = steps[currentStep]

  return (
    <WizardContext.Provider
      value={{
        currentStep,
        totalSteps,
        nextStep,
        prevStep,
        goToStep,
        isFirstStep,
        isLastStep,
        canGoNext,
        setCanGoNext,
      }}
    >
      <div className={cn('space-y-6', className)}>
        {/* Progress Bar */}
        {showProgress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>
                {currentStep + 1} / {totalSteps}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Step Indicator */}
        {showStepIndicator && (
          <div className="flex items-center justify-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <button
                  onClick={() => goToStep(index)}
                  disabled={!allowStepNavigation || index > currentStep}
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all',
                    index < currentStep &&
                      'bg-primary border-primary text-primary-foreground',
                    index === currentStep &&
                      'border-primary bg-primary/10 text-primary',
                    index > currentStep &&
                      'border-gray-300 text-gray-400',
                    allowStepNavigation && index <= currentStep &&
                      'cursor-pointer hover:ring-2 hover:ring-primary/20'
                  )}
                >
                  {index < currentStep ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </button>
                {index < steps.length - 1 && (
                  <div
                    className={cn(
                      'w-12 h-0.5 mx-2',
                      index < currentStep ? 'bg-primary' : 'bg-gray-200'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step Title */}
        <div className="text-center">
          <h2 className="text-xl font-semibold">{currentStepData.title}</h2>
          {currentStepData.description && (
            <p className="mt-1 text-sm text-gray-500">
              {currentStepData.description}
            </p>
          )}
        </div>

        {/* Step Content */}
        <div className="min-h-[200px]">{currentStepData.component}</div>

        {/* Navigation Buttons */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div className="flex gap-2">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                취소
              </Button>
            )}
            {!isFirstStep && (
              <Button variant="outline" onClick={prevStep}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                이전
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            {currentStepData.canSkip && !isLastStep && (
              <Button
                variant="ghost"
                onClick={() => setCurrentStep((prev) => prev + 1)}
              >
                건너뛰기
              </Button>
            )}
            <Button
              onClick={nextStep}
              disabled={!canGoNext || isValidating}
            >
              {isValidating ? (
                '확인 중...'
              ) : isLastStep ? (
                <>
                  {completeButtonText}
                  <Check className="h-4 w-4 ml-2" />
                </>
              ) : (
                <>
                  다음
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </WizardContext.Provider>
  )
}

// Simplified Wizard Step wrapper for cleaner usage
interface WizardStepWrapperProps {
  children: ReactNode
  className?: string
}

export function WizardStepContent({ children, className }: WizardStepWrapperProps) {
  return <div className={cn('space-y-4', className)}>{children}</div>
}

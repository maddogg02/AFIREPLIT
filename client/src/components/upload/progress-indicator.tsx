interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps?: number;
}

export default function ProgressIndicator({ currentStep, totalSteps = 5 }: ProgressIndicatorProps) {
  return (
    <div className="flex justify-center mb-6">
      <div className="flex items-center space-x-4">
        {Array.from({ length: totalSteps }, (_, index) => {
          const step = index + 1;
          const isActive = step <= currentStep;
          const isLast = step === totalSteps;
          
          return (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
                data-testid={`step-${step}`}
              >
                {step}
              </div>
              {!isLast && (
                <div
                  className={`w-12 h-1 mx-2 ${
                    step < currentStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

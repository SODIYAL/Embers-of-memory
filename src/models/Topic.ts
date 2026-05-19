export interface Topic {
  id: string;
  name: string;
  culturalWeight: 'low' | 'medium' | 'high' | 'very_high';
  strongFormats: string[];
  weakFormats: string[];
}

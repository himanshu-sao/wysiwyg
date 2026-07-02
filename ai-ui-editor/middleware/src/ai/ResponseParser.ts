""" Parse AI responses into EditResponse format """
import { EditResponse } from '../shared/types';

class ResponseParser {
    static parse(response: string): EditResponse {
        try {
            const parsed = JSON.parse(response);
            if (!parsed.success || !parsed.message || !parsed.edits) {
                throw new Error('Invalid AI response format');
            }
            return parsed;
        } catch (error) {
            console.error('Failed to parse AI response:', error);
            return {
                success: false,
                message: 'Failed to parse AI response',
                edits: []
            };
        }
    }
}

export default ResponseParser;
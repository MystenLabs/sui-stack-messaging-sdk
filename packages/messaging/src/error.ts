export class MessagingClientError extends Error {}

export class UserError extends MessagingClientError {}

export class MessagingAPIError extends MessagingClientError {
	constructor(
		message: string,
		public requestId?: string,
		public status?: number,
	) {
		super(message);
	}

	// @ts-ignore todo: remove 'ts-ignore' when start using this function
	static #generate(error: string, message: string, requestId: string, status?: number) {
		switch (error) {
			case 'NotImplementedFeature':
				return new ApiNotImplementedFeatureError(requestId);
			default:
				return new GeneralError(message, requestId, status);
		}
	}

	static async assertResponse(response: Response, requestId: string) {
		if (response.ok) {
			return;
		}
		let errorInstance: MessagingAPIError;
		try {
			const text = await response.text();
			const error = JSON.parse(text)['error'];
			const message = JSON.parse(text)['message'];
			errorInstance = MessagingAPIError.#generate(error, message, requestId);
		} catch (e) {
			// If we can't parse the response as JSON or if it doesn't have the expected format,
			// fall back to using the status text
			errorInstance = new GeneralError(response.statusText, requestId, response.status);
		}
		throw errorInstance;
	}
}

export class ApiNotImplementedFeatureError extends MessagingAPIError {
	constructor(requestId?: string) {
		super('API: Not implemented yet', requestId);
	}
}

/** General server errors that are not specific to the Messaging API (e.g., 404 "Not Found") */
export class GeneralError extends MessagingAPIError {}

// Errors returned by the SDK
export class NotImplementedFeatureError extends UserError {
	constructor() {
		super('SDK: Not implemented yet');
	}
}

export function toMajorityError(errors: Error[]): Error {
	let maxCount = 0;
	let majorityError = errors[0];
	const counts = new Map<string, number>();
	for (const error of errors) {
		const errorName = error.constructor.name;
		const newCount = (counts.get(errorName) || 0) + 1;
		counts.set(errorName, newCount);

		if (newCount > maxCount) {
			maxCount = newCount;
			majorityError = error;
		}
	}

	return majorityError;
}

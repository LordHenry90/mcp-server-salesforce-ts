export interface SalesforceCredentials {
    loginUrl: string;
    consumerKey: string;
    username: string;
    privateKey: string;
}

export interface CreateCustomObjectRequest {
    apiName: string;
    label: string;
    pluralLabel: string;
}

export interface CreateCustomFieldRequest {
    objectApiName: string;
    fieldApiName: string;
    label: string;
    type: 'Text' | 'Number' | 'Date' | 'Checkbox' | 'LongTextArea';
    length?: number;
}

export interface CreateApexClassRequest {
    className: string;
    body: string;
    apiVersion?: number;
}

export interface CreateLWCRequest {
    componentName: string;
    masterLabel: string;
    isExposed: boolean;
    targets: string[];
    htmlContent: string;
    jsContent: string;
    apiVersion?: number;
}

export interface UpdatePermissionsRequest {
    profileName: string;
    fieldApiName: string;
    readable: boolean;
    editable: boolean;
}


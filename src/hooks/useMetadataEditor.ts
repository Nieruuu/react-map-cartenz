import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  SpatialFeature,
  SpatialFeatureAttribute
} from '../lib/api/spatialFeature';
import {
  updateSpatialFeature,
  getSpatialFeatureById
} from '../lib/api/spatialFeature';
import { HttpError } from '../lib/api/client';

export type EditableAttribute = {
  id: string;
  attributeKey: string;
  attributeValue: string;
  attributeLabel?: string;
  attributeValueType?: number;
  isNew?: boolean;
  isDirty?: boolean;
  isSaving?: boolean;
  hasError?: boolean;
  errorMessage?: string;
};

export type MetadataEditorState = {
  featureId: number | null;
  isEditing: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  originalFeature: SpatialFeature | null;
  editableAttributes: EditableAttribute[];
  namaWilayah: string;
  idWilayah: string;
  validationErrors: Record<string, string | undefined>;
};

export type UseMetadataEditorReturn = {
  state: MetadataEditorState;
  actions: {
    startEditing: (feature: SpatialFeature) => void;
    cancelEditing: () => void;
    saveChanges: () => Promise<SpatialFeature | null>;
    updateNamaWilayah: (value: string) => void;
    updateIdWilayah: (value: string) => void;
    updateAttribute: (id: string, field: keyof EditableAttribute, value: unknown) => void;
    addAttribute: () => void;
    removeAttribute: (id: string) => void;
    validateAttribute: (id: string) => boolean;
    validateAll: () => boolean;
  };
};

const DEBOUNCE_DELAY = 500;

export function useMetadataEditor(): UseMetadataEditorReturn {
  const [state, setState] = useState<MetadataEditorState>({
    featureId: null,
    isEditing: false,
    isLoading: false,
    hasUnsavedChanges: false,
    originalFeature: null,
    editableAttributes: [],
    namaWilayah: '',
    idWilayah: '',
    validationErrors: {},
  });

  const debounceTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const pendingUpdatesRef = useRef<Map<string, Partial<EditableAttribute>>>(new Map());

  // Clean up debounce timers on unmount
  useEffect(() => {
    const currentTimers = debounceTimersRef.current;
    return () => {
      currentTimers.forEach(timer => clearTimeout(timer));
    };
  }, []);

  const startEditing = useCallback((feature: SpatialFeature) => {
    const editableAttributes: EditableAttribute[] = [];
    
    // System attributes that should be excluded from the editable list
    const systemAttributes = new Set([
      'spatialFeature.type',
      'spatialFeature.geometry',
      'spatialFeature.refWilayah'
    ]);
    
    // Extract existing attributes, but exclude system attributes
    if (feature.attribute && Array.isArray(feature.attribute)) {
      feature.attribute.forEach(attr => {
        // Skip system attributes
        if (systemAttributes.has(attr.attributeKey)) {
          return;
        }
        
        // Extract the user-friendly key (remove spatialFeature. prefix)
        const displayKey = attr.attributeKey.replace(/^spatialFeature\./, '');
        
        editableAttributes.push({
          id: String(attr.id),
          attributeKey: displayKey,
          attributeValue: attr.attributeValue,
          attributeLabel: attr.attributeLabel || displayKey,
          attributeValueType: attr.attributeValueType || 1,
          isNew: false,
          isDirty: false,
          isSaving: false,
          hasError: false,
        });
      });
    }

    // Extract Nama Wilayah and ID Wilayah
    const namaWilayah = feature.attribute?.find(attr => attr.attributeKey === 'spatialFeature.refWilayah')?.attributeValue || '';
    const idWilayah = String(feature.id || '');

    setState({
      featureId: feature.id,
      isEditing: true,
      isLoading: false,
      hasUnsavedChanges: false,
      originalFeature: feature,
      editableAttributes,
      namaWilayah,
      idWilayah,
      validationErrors: {},
    });
  }, []);

  const cancelEditing = useCallback(() => {
    // Clear all debounce timers
    debounceTimersRef.current.forEach(timer => clearTimeout(timer));
    debounceTimersRef.current.clear();
    pendingUpdatesRef.current.clear();

    setState({
      featureId: null,
      isEditing: false,
      isLoading: false,
      hasUnsavedChanges: false,
      originalFeature: null,
      editableAttributes: [],
      namaWilayah: '',
      idWilayah: '',
      validationErrors: {},
    });
  }, []);

  const validateAttribute = useCallback((id: string): boolean => {
    const attribute = state.editableAttributes.find(attr => attr.id === id);
    if (!attribute) return false;

    const errors: string[] = [];

    // Validate attribute key (user input without prefix)
    if (!attribute.attributeKey.trim()) {
      errors.push('Attribute key is required');
    } else if (attribute.attributeKey.includes(' ')) {
      errors.push('Attribute key cannot contain spaces');
    } else if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(attribute.attributeKey)) {
      errors.push('Attribute key must contain only letters, numbers, and underscores, and start with a letter');
    }

    // Validate attribute value
    if (!attribute.attributeValue.trim()) {
      errors.push('Attribute value is required');
    }

    const hasError = errors.length > 0;
    
    setState(prev => ({
      ...prev,
      editableAttributes: prev.editableAttributes.map(attr =>
        attr.id === id
          ? { ...attr, hasError, errorMessage: hasError ? errors[0] : undefined }
          : attr
      ),
      validationErrors: {
        ...prev.validationErrors,
        [id]: hasError ? errors[0] : undefined,
      },
    }));

    return !hasError;
  }, [state.editableAttributes]);

  const validateAll = useCallback((): boolean => {
    let isValid = true;
    state.editableAttributes.forEach(attr => {
      if (!validateAttribute(attr.id)) {
        isValid = false;
      }
    });
    return isValid;
  }, [state.editableAttributes, validateAttribute]);

  const updateNamaWilayah = useCallback((value: string) => {
    setState(prev => ({
      ...prev,
      namaWilayah: value,
      hasUnsavedChanges: true,
    }));
  }, []);

  const updateIdWilayah = useCallback((value: string) => {
    setState(prev => ({
      ...prev,
      idWilayah: value,
      hasUnsavedChanges: true,
    }));
  }, []);

  const updateAttribute = useCallback((id: string, field: keyof EditableAttribute, value: unknown) => {
    setState(prev => ({
      ...prev,
      editableAttributes: prev.editableAttributes.map(attr =>
        attr.id === id
          ? { ...attr, [field]: value, isDirty: true, hasError: false, errorMessage: undefined }
          : attr
      ),
      hasUnsavedChanges: true,
      validationErrors: {
        ...prev.validationErrors,
        [id]: undefined,
      },
    }));

    // Debounce validation for key and value fields
    if (field === 'attributeKey' || field === 'attributeValue') {
      const timerId = `${id}-${field}`;
      
      // Clear existing timer
      const existingTimer = debounceTimersRef.current.get(timerId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer for validation
      const newTimer = setTimeout(() => {
        validateAttribute(id);
        debounceTimersRef.current.delete(timerId);
      }, DEBOUNCE_DELAY);

      debounceTimersRef.current.set(timerId, newTimer);
    }
  }, [validateAttribute]);

  const addAttribute = useCallback(() => {
    const newAttribute: EditableAttribute = {
      id: `new_${Date.now()}`,
      attributeKey: '',
      attributeValue: '',
      attributeLabel: '',
      attributeValueType: 1,
      isNew: true,
      isDirty: true,
      isSaving: false,
      hasError: false,
    };

    setState(prev => ({
      ...prev,
      editableAttributes: [...prev.editableAttributes, newAttribute],
      hasUnsavedChanges: true,
    }));
  }, []);

  const removeAttribute = useCallback((id: string) => {
    setState(prev => {
      const attribute = prev.editableAttributes.find(attr => attr.id === id);
      
      // If it's a new attribute, just remove it from the list
      if (attribute?.isNew) {
        return {
          ...prev,
          editableAttributes: prev.editableAttributes.filter(attr => attr.id !== id),
          hasUnsavedChanges: true,
        };
      }

      // For existing attributes, we'll mark them for deletion
      return {
        ...prev,
        editableAttributes: prev.editableAttributes.map(attr =>
          attr.id === id
            ? { ...attr, isDirty: true, hasError: false, errorMessage: undefined }
            : attr
        ),
        hasUnsavedChanges: true,
      };
    });
  }, []);

  const saveChanges = useCallback(async (): Promise<SpatialFeature | null> => {
    if (!state.featureId || !state.originalFeature) return null;

    // Validate all attributes first
    if (!validateAll()) {
      return null;
    }

    setState(prev => ({ ...prev, isLoading: true }));

    try {
      const featureId = state.featureId;
      
      // STEP 1: Perform pre-flight GET request to get current complete attribute data
      console.log('Performing pre-flight GET request for feature:', featureId);
      const currentFeature = await getSpatialFeatureById(featureId);
      
      // Start with all existing attributes from the current feature (not original)
      let allAttributes: SpatialFeatureAttribute[] = [];
      
      if (currentFeature.attribute && Array.isArray(currentFeature.attribute)) {
        allAttributes = [...currentFeature.attribute];
      }

      // STEP 2: Process Nama Wilayah update
      if (state.namaWilayah !== currentFeature.attribute?.find(attr => attr.attributeKey === 'spatialFeature.refWilayah')?.attributeValue) {
        const refWilayahAttrIndex = allAttributes.findIndex(attr => attr.attributeKey === 'spatialFeature.refWilayah');
        if (refWilayahAttrIndex !== -1) {
          allAttributes[refWilayahAttrIndex] = {
            ...allAttributes[refWilayahAttrIndex],
            attributeValue: state.namaWilayah,
          };
        }
      }

      // STEP 3: Process attribute updates and additions
      console.log('Processing attribute updates...');
      console.log('Current attributes from GET:', allAttributes.map(attr => ({
        id: attr.id,
        attributeKey: attr.attributeKey,
        attributeValue: attr.attributeValue
      })));
      console.log('Editable attributes from state:', state.editableAttributes.map(attr => ({
        id: attr.id,
        attributeKey: attr.attributeKey,
        attributeValue: attr.attributeValue,
        isNew: attr.isNew,
        isDirty: attr.isDirty
      })));
      
      for (const attribute of state.editableAttributes) {
        if (attribute.isDirty && !attribute.hasError) {
          const fullAttributeKey = `spatialFeature.${attribute.attributeKey}`;
          
          if (attribute.isNew) {
            // New attribute - add to the array with minimal structure
            console.log(`Adding new attribute: ${fullAttributeKey} = ${attribute.attributeValue}`);
            allAttributes.push({
              attributeKey: fullAttributeKey,
              attributeValue: attribute.attributeValue,
              attributeLabel: attribute.attributeLabel || attribute.attributeKey, // Keep the original label without prefix
              attributeValueType: attribute.attributeValueType || 1,
              // No ID and other fields for new attributes
            } as SpatialFeatureAttribute);
          } else {
            // Existing attribute - find the matching attribute from the GET response and update it
            console.log(`Looking for existing attribute with key: ${fullAttributeKey}`);
            
            // First try to match by the original attribute ID stored in the editable attribute
            let existingIndex = -1;
            const originalAttributeId = parseInt(attribute.id);
            
            if (!isNaN(originalAttributeId)) {
              existingIndex = allAttributes.findIndex(attr => attr.id === originalAttributeId);
              console.log(`Trying to match by ID ${originalAttributeId}: found at index ${existingIndex}`);
            }
            
            // If ID matching fails, try to match by attribute key
            if (existingIndex === -1) {
              existingIndex = allAttributes.findIndex(attr => {
                const currentAttrKey = attr.attributeKey;
                const editingAttrKey = fullAttributeKey;
                return currentAttrKey === editingAttrKey;
              });
              console.log(`Trying to match by key ${fullAttributeKey}: found at index ${existingIndex}`);
            }
            
            if (existingIndex !== -1) {
              // Preserve the complete original structure and only update the necessary fields
              const originalAttribute = allAttributes[existingIndex];
              console.log(`Found existing attribute:`, {
                id: originalAttribute.id,
                attributeKey: originalAttribute.attributeKey,
                attributeValue: originalAttribute.attributeValue,
                dataType: originalAttribute.dataType,
                rowIdentifier: originalAttribute.rowIdentifier,
                groupIdentifier: originalAttribute.groupIdentifier,
                attributeIndex: originalAttribute.attributeIndex,
                status: originalAttribute.status
              });
              
              // Create the updated attribute with ALL original fields preserved
              const updatedAttribute = {
                // Preserve ALL original fields from the GET response
                id: originalAttribute.id,
                dataType: originalAttribute.dataType,
                rowIdentifier: originalAttribute.rowIdentifier,
                groupIdentifier: originalAttribute.groupIdentifier,
                attributeIndex: originalAttribute.attributeIndex,
                status: originalAttribute.status,
                // Update only the fields that can be modified by the user
                attributeKey: fullAttributeKey,
                attributeValue: attribute.attributeValue,
                attributeLabel: attribute.attributeLabel || attribute.attributeKey, // Keep the original label without prefix
                attributeValueType: attribute.attributeValueType || 1,
              };
              
              allAttributes[existingIndex] = updatedAttribute;
              console.log(`Updated attribute with ID ${originalAttribute.id}:`, updatedAttribute);
            } else {
              console.error(`Could not find matching attribute for key: ${fullAttributeKey} or ID: ${originalAttributeId}`);
              console.error('Available attributes:', allAttributes.map(attr => ({
                id: attr.id,
                attributeKey: attr.attributeKey
              })));
            }
          }
        }
      }

      // STEP 4: Make API call to update the feature with ALL attributes
      console.log('Sending PATCH request with', allAttributes.length, 'attributes');
      const updatedFeature = await updateSpatialFeature(featureId, allAttributes);

      // STEP 5: Update state with the new feature data
      const editableAttributes: EditableAttribute[] = [];
      
      // System attributes that should be excluded from the editable list
      const systemAttributes = new Set([
        'spatialFeature.type',
        'spatialFeature.geometry',
        'spatialFeature.refWilayah'
      ]);

      if (updatedFeature.attribute && Array.isArray(updatedFeature.attribute)) {
        updatedFeature.attribute.forEach(attr => {
          // Skip system attributes
          if (systemAttributes.has(attr.attributeKey)) {
            return;
          }
          
          // Extract the user-friendly key (remove spatialFeature. prefix)
          const displayKey = attr.attributeKey.replace(/^spatialFeature\./, '');
          
          editableAttributes.push({
            id: String(attr.id),
            attributeKey: displayKey,
            attributeValue: attr.attributeValue,
            attributeLabel: attr.attributeLabel || displayKey,
            attributeValueType: attr.attributeValueType || 1,
            isNew: false,
            isDirty: false,
            isSaving: false,
            hasError: false,
          });
        });
      }

      const newNamaWilayah = updatedFeature.attribute?.find(attr => attr.attributeKey === 'spatialFeature.refWilayah')?.attributeValue || '';
      const newIdWilayah = String(updatedFeature.id || '');

      setState({
        featureId: updatedFeature.id,
        isEditing: true,
        isLoading: false,
        hasUnsavedChanges: false,
        originalFeature: updatedFeature,
        editableAttributes,
        namaWilayah: newNamaWilayah,
        idWilayah: newIdWilayah,
        validationErrors: {},
      });

      return updatedFeature;
    } catch (error) {
      console.error('Failed to save metadata:', error);
      
      let errorMessage = 'Failed to save changes';
      if (error instanceof HttpError) {
        console.error('HTTP Error:', error.status, error.message);
        if (error.status === 401) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (error.status === 403) {
          errorMessage = 'You do not have permission to edit this feature.';
        } else if (error.status === 404) {
          errorMessage = 'Feature not found.';
        } else if (error.status >= 400 && error.status < 500) {
          errorMessage = 'Invalid data. Please check your input.';
        } else if (error.status >= 500) {
          errorMessage = 'Server error. Please check the console for details.';
        }
      }

      // You could add a toast notification here
      alert(errorMessage);

      setState(prev => ({ ...prev, isLoading: false }));
      return null;
    }
  }, [state, validateAll]);

  return {
    state,
    actions: {
      startEditing,
      cancelEditing,
      saveChanges,
      updateNamaWilayah,
      updateIdWilayah,
      updateAttribute,
      addAttribute,
      removeAttribute,
      validateAttribute,
      validateAll,
    },
  };
}

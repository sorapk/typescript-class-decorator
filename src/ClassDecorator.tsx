interface CustomDescriptor extends PropertyDescriptor {
    metaData: {
        registeredDecoratorCnt: number,
        original: Function | any,
        descriptorId: DescriptorId
    }
}
export interface InstanceFieldMeta {
    decoratedCnt: number,                //number of decoration so far
    decorated: any,                      //final decorated field
    original: any,                       //origianl field
    propertyKey: string
}
interface InstanceMetaContainer {
    [key:string] : InstanceFieldMeta
}
type DescriptorId = string;
type Field = any;

type CustomGet = (() => Function | any);
type CustomSet = ((val: any) => void);

type MethodDecorator = (this: any, modMethod: Function) => Function;
type PropertyDecorator = (this: any, modField: any) => any;

const IdGenerator = (function(){
    let currCnt = 0;
    return {
        getId: function() : string {
            let res = currCnt;
            currCnt++;
            return res.toString(36);
        }
    }
})()
const kMetaContainerName = "__decoratorMetaContainer";

function initInstanceMetaContainer(this : any) : void {

    //decorate meta attached to instance
    if (this[kMetaContainerName] === undefined) {
        
        let dataStructure : InstanceMetaContainer = {};

        Object.defineProperty(this, kMetaContainerName, {
            enumerable: false,
            writable: true,
            value: dataStructure
        })
    }

}
function removeFieldMeta(this: any, descriptorId : DescriptorId): void {

    if (this[kMetaContainerName]) {
        delete this[kMetaContainerName][descriptorId];
    }

}
function getAndAddFieldMeta(this : any, descriptorId : DescriptorId, orinalField: Field, propertyKey: string) : InstanceFieldMeta {
    
    // find meta data for this particular field
    let metaContainer : InstanceMetaContainer = this[kMetaContainerName];
    
    let insFieldMeta: InstanceFieldMeta | undefined = metaContainer[descriptorId];
    
    // if doesn't exist add to array
    if (insFieldMeta === undefined) {
        insFieldMeta = {
            decoratedCnt: 0,
            decorated: orinalField,
            original: orinalField,
            propertyKey: propertyKey
        }
        metaContainer[descriptorId] = insFieldMeta;
    }

    return insFieldMeta;
}
function initAndGetCustomDescriptor(descriptor: PropertyDescriptor | CustomDescriptor): CustomDescriptor {

    let custDesc = descriptor as CustomDescriptor;

    if (custDesc.metaData === undefined) {
        custDesc.metaData = {
            registeredDecoratorCnt: 0,
            original: descriptor.value,
            descriptorId: IdGenerator.getId()
        };
    } 

    return custDesc;
}
function decorateField(this: any, decorator: MethodDecorator, previousGet : CustomGet | undefined, insFieldMeta: InstanceFieldMeta, descriptor: CustomDescriptor) : any {
    
    if (insFieldMeta.decoratedCnt === descriptor.metaData.registeredDecoratorCnt) {
    
        return insFieldMeta.decorated;
    
    } else {
        let modField = descriptor.metaData.original;

        //call previous get / accessor wrapper
        if (previousGet) {
            modField = previousGet.apply(this);
        }

        // decorator code
        modField = decorator.apply(this, [modField]);
        insFieldMeta.decoratedCnt++

        if (insFieldMeta.decoratedCnt === descriptor.metaData.registeredDecoratorCnt) {
            insFieldMeta.decorated = modField;
        }

        return modField;
    }
}
function decoratorFactory(decorator: MethodDecorator) : Function {   

    return function (target: object, propertyKey: string, descriptor: PropertyDescriptor | CustomDescriptor): CustomDescriptor {

        // ==== register decorator, setup custom descriptor ====
        const custDesc = initAndGetCustomDescriptor(descriptor);
        custDesc.metaData.registeredDecoratorCnt++;

        // ==== init const variables for this 'decorator' ====
        const originalField: Field = custDesc.metaData.original;
        const registeredIndex: number = custDesc.metaData.registeredDecoratorCnt;
        const previousGet: CustomGet | undefined = custDesc.get;
        const previousSet: CustomSet | undefined = custDesc.set;
        const descriptorId: DescriptorId = custDesc.metaData.descriptorId as DescriptorId;

        // ==== decorate init routine =====
        const decorateRoutine = function (this:any) {
            let instanceMeta: InstanceFieldMeta;

            initInstanceMetaContainer.apply(this)

            instanceMeta = getAndAddFieldMeta.apply(this, [descriptorId, originalField, propertyKey]);

            return decorateField.apply(this, [decorator, previousGet, instanceMeta, custDesc])
        }
        
        // ==== setup custom get / set ====
        const newGet: CustomGet = function (this: any) {

            return decorateRoutine.apply(this);

        }
        const newSet: CustomSet = function (this: any, val: any) {
            // if set happens, we have to redecorate!

            removeFieldMeta.apply(this, [descriptorId]);

            if (previousSet) {
                previousSet.apply(this, [val]);
            }

            let decorated: any = decorateRoutine.apply(this);
        }   

        // === return modified descriptor ====, NOTE: can't return modified desc => get error for modifing value and getter
        return {
            configurable: true,
            metaData: custDesc.metaData,
            get: newGet,
            set: newSet,
            enumerable: custDesc.enumerable
        };
    }   
}

// === decorator factories types===
function property_DecoratorFactory(decorator : PropertyDecorator) {

}
function method_DecoratorFactory(decorator : MethodDecorator) {

    return decoratorFactory(decorator);

}
// ===== decorators =====:
export const  kAttachedContainerName = "__attached";
export interface AttachMetaData {
    [key: string] : any
}
export interface AttachedValue {
    [kAttachedContainerName]: AttachMetaData
}
export type MutatorCallback = ((method : Function) => void)

export const mutator = function(onPostMutate : MutatorCallback, onPreMutate? : MutatorCallback) : Function {
    return method_DecoratorFactory(function(modMethod) {
            return function(this: any)  {   //upon accessing/get, this decorated function will be returned i.e. obj.x
                let result;
                if (onPreMutate) {
                    onPreMutate.apply(this, [modMethod]);
                }
                result = modMethod.apply(this, arguments);
                onPostMutate.apply(this, [modMethod]);

                return result;
            }
        });
}
export const bind = method_DecoratorFactory(function(this: any, modMethod : Function) {
    return modMethod.bind(this);    //upon accessing, this will be executed, returning a newly bind function i.e. obj.x
});



#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>
#import <mach/mach.h>
#import <os/proc.h>

@interface DeviceMemory : NSObject <RCTBridgeModule>
@end

@implementation DeviceMemory

RCT_EXPORT_MODULE(DeviceMemory)

RCT_REMAP_METHOD(
  getMemoryInfo,
  getMemoryInfoWithResolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)
{
  @try {
    const double bytesPerMb =
      1024.0 * 1024.0;

    NSMutableDictionary *result =
      [NSMutableDictionary dictionary];

    uint64_t totalMemory =
      [NSProcessInfo processInfo].physicalMemory;

    if (totalMemory > 0) {
      result[@"totalMemoryMb"] =
        @((double)totalMemory / bytesPerMb);
    }

    uint64_t availableMemory =
      os_proc_available_memory();

    result[@"availableMemoryMb"] =
      @((double)availableMemory / bytesPerMb);

    task_vm_info_data_t vmInfo;
    mach_msg_type_number_t count =
      TASK_VM_INFO_COUNT;

    kern_return_t status =
      task_info(
        mach_task_self_,
        TASK_VM_INFO,
        (task_info_t)&vmInfo,
        &count
      );

    if (status == KERN_SUCCESS) {
      result[@"appMemoryMb"] =
        @(
          (double)vmInfo.phys_footprint /
          bytesPerMb
        );
    }

    resolve(result);

  } @catch (NSException *exception) {
    NSError *error =
      [NSError errorWithDomain:@"DeviceMemory"
                          code:1
                      userInfo:@{
                        NSLocalizedDescriptionKey:
                          exception.reason ?: @"Erro de memoria"
                      }];

    reject(
      @"DEVICE_MEMORY_ERROR",
      exception.reason,
      error
    );
  }
}

@end

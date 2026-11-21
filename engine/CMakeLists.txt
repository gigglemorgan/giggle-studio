cmake_minimum_required(VERSION 3.18)
project(giggle_engine LANGUAGES CXX CUDA)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CUDA_STANDARD 17)
set(CMAKE_CUDA_STANDARD_REQUIRED ON)

if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
    set(CMAKE_CUDA_ARCHITECTURES 120)
endif()

set(CMAKE_CUDA_FLAGS "${CMAKE_CUDA_FLAGS} -O3 --use_fast_math -Xcompiler -fPIC")

include_directories(include)

add_library(giggle_engine SHARED
    src/giggle_engine.cu
    kernels/rmsnorm.cu
    kernels/rope.cu
    kernels/swiglu.cu
    kernels/gemv_f16.cu
    kernels/gemv_q5_0.cu
    kernels/gemv_q8_0.cu
    kernels/gemv_q4_k.cu
    kernels/gemv_q6_k.cu
    kernels/attention.cu
    kernels/sampling.cu
)

set_target_properties(giggle_engine PROPERTIES
    CUDA_SEPARABLE_COMPILATION ON
    POSITION_INDEPENDENT_CODE ON
)

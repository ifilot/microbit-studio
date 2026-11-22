ENTRY(simulator_start)

MEMORY {
    FLASH (rx) : ORIGIN = 0x10000000, LENGTH = 1M
    RAM (rwx) : ORIGIN = 0x20000000, LENGTH = 128K
}

/* The emulator reserves the upper half of its 256 KiB RAM for simulated stacks. */
__heap_end = ORIGIN(RAM) + LENGTH(RAM);

SECTIONS {
    .text : {
        LONG(0x20040000)
        LONG(simulator_start)
        LONG(simulator_exit | 1)
        KEEP(*(.text.simulator_exit))
        *(.text .text.* .rodata .rodata.*)
        . = ALIGN(4);
    } > FLASH

    .ARM.extab : { *(.ARM.extab* .gnu.linkonce.armextab.*) } > FLASH
    .ARM.exidx : {
        __exidx_start = .;
        *(.ARM.exidx* .gnu.linkonce.armexidx.*)
        __exidx_end = .;
    } > FLASH

    .init_array : {
        __init_array_start = .;
        KEEP(*(SORT(.init_array.*)))
        KEEP(*(.init_array))
        __init_array_end = .;
    } > FLASH

    .data : {
        __data_start = .;
        *(.data .data.*)
        . = ALIGN(4);
        __data_end = .;
    } > RAM AT > FLASH
    __data_load = LOADADDR(.data);

    .bss (NOLOAD) : {
        __bss_start = .;
        *(.bss .bss.* COMMON)
        . = ALIGN(8);
        __bss_end = .;
        __heap_start = .;
    } > RAM
}

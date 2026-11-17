// Generated from pinned upstream Pydantic models.
export const MODEL_REGISTRY = {
  "http://schema.org/CreativeWork": {
    "name": "ROCrateCreativeWork",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "default": "ro-crate-metadata.json",
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "default": "CreativeWork",
          "title": "@Type"
        },
        "conformsTo": {
          "additionalProperties": true,
          "default": {
            "@id": "https://w3id.org/ro/crate/1.1"
          },
          "title": "Conformsto",
          "type": "object"
        },
        "about": {
          "additionalProperties": true,
          "default": {
            "@id": "./"
          },
          "title": "About",
          "type": "object"
        }
      },
      "title": "ROCrateCreativeWork",
      "type": "object"
    },
    "defaults": {
      "@id": "ro-crate-metadata.json",
      "@type": "CreativeWork",
      "conformsTo": {
        "@id": "https://w3id.org/ro/crate/1.1"
      },
      "about": {
        "@id": "./"
      }
    }
  },
  "http://bia/Study": {
    "name": "Study",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "author": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "minItems": 1,
          "title": "Author",
          "type": "array"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "license": {
          "format": "uri",
          "minLength": 1,
          "title": "License",
          "type": "string"
        },
        "datePublished": {
          "format": "date",
          "title": "Datepublished",
          "type": "string"
        },
        "dateModified": {
          "anyOf": [
            {
              "format": "date",
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Datemodified"
        },
        "keywords": {
          "items": {
            "type": "string"
          },
          "title": "Keywords",
          "type": "array"
        },
        "acknowledgement": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Acknowledgement"
        },
        "hasPart": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Haspart",
          "type": "array"
        },
        "accessionId": {
          "title": "Accessionid",
          "type": "string"
        },
        "doi": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Doi"
        },
        "seeAlso": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Seealso",
          "type": "array"
        },
        "relatedPublication": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Relatedpublication",
          "type": "array"
        },
        "funding": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Funding",
          "type": "array"
        },
        "fundingStatement": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Fundingstatement"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "author",
        "description",
        "license",
        "datePublished",
        "hasPart",
        "accessionId"
      ],
      "title": "Study",
      "type": "object"
    },
    "defaults": {
      "dateModified": null,
      "keywords": [],
      "acknowledgement": null,
      "doi": null,
      "seeAlso": [],
      "relatedPublication": [],
      "funding": [],
      "fundingStatement": null
    }
  },
  "http://bia/Publication": {
    "name": "Publication",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        },
        "authorNames": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Authornames"
        },
        "yearPublished": {
          "anyOf": [
            {
              "type": "integer"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Yearpublished"
        },
        "pubmedId": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Pubmedid"
        },
        "doi": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Doi"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "Publication",
      "type": "object"
    },
    "defaults": {
      "name": null,
      "authorNames": null,
      "yearPublished": null,
      "pubmedId": null,
      "doi": null
    }
  },
  "http://bia/Contributor": {
    "name": "Contributor",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "address": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Address"
        },
        "website": {
          "anyOf": [
            {
              "format": "uri",
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Website"
        },
        "memberOf": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Memberof",
          "type": "array"
        },
        "role": {
          "items": {
            "type": "string"
          },
          "title": "Role",
          "type": "array"
        },
        "email": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Email"
        }
      },
      "required": [
        "@id",
        "@type",
        "name"
      ],
      "title": "Contributor",
      "type": "object"
    },
    "defaults": {
      "address": null,
      "website": null,
      "memberOf": [],
      "role": [],
      "email": null
    }
  },
  "http://bia/Affiliation": {
    "name": "Affiliation",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "address": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Address"
        },
        "website": {
          "anyOf": [
            {
              "format": "uri",
              "minLength": 1,
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Website"
        }
      },
      "required": [
        "@id",
        "@type",
        "name"
      ],
      "title": "Affiliation",
      "type": "object"
    },
    "defaults": {
      "address": null,
      "website": null
    }
  },
  "http://bia/Grant": {
    "name": "Grant",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "funder": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Funder",
          "type": "array"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        },
        "identifier": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Identifier"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "Grant",
      "type": "object"
    },
    "defaults": {
      "funder": [],
      "name": null,
      "identifier": null
    }
  },
  "http://bia/FundingBody": {
    "name": "FundingBody",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        },
        "identifier": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Identifier"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "FundingBody",
      "type": "object"
    },
    "defaults": {
      "name": null,
      "identifier": null
    }
  },
  "http://bia/ExternalReference": {
    "name": "ExternalReference",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "description": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Description"
        },
        "additionalType": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Additionaltype"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "ExternalReference",
      "type": "object"
    },
    "defaults": {
      "description": null,
      "additionalType": null
    }
  },
  "http://bia/Dataset": {
    "name": "Dataset",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Description"
        },
        "associatedBiologicalEntity": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedbiologicalentity",
          "type": "array"
        },
        "associatedSpecimenImagingPreparationProtocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedspecimenimagingpreparationprotocol",
          "type": "array"
        },
        "associatedSpecimen": {
          "anyOf": [
            {
              "$ref": "#/$defs/ObjectReference"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "associatedCreationProcess": {
          "anyOf": [
            {
              "$ref": "#/$defs/ObjectReference"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "associatedSourceImage": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedsourceimage",
          "type": "array"
        },
        "associatedImageAcquisitionProtocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedimageacquisitionprotocol",
          "type": "array"
        },
        "associatedAnnotationMethod": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedannotationmethod",
          "type": "array"
        },
        "associatedImageAnalysisMethod": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedimageanalysismethod",
          "type": "array"
        },
        "associatedImageCorrelationMethod": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedimagecorrelationmethod",
          "type": "array"
        },
        "associatedProtocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Associatedprotocol",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type",
        "name"
      ],
      "title": "Dataset",
      "type": "object"
    },
    "defaults": {
      "description": null,
      "associatedBiologicalEntity": [],
      "associatedSpecimenImagingPreparationProtocol": [],
      "associatedSpecimen": null,
      "associatedCreationProcess": null,
      "associatedSourceImage": [],
      "associatedImageAcquisitionProtocol": [],
      "associatedAnnotationMethod": [],
      "associatedImageAnalysisMethod": [],
      "associatedImageCorrelationMethod": [],
      "associatedProtocol": []
    }
  },
  "http://bia/FileList": {
    "name": "FileList",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "tableSchema": {
          "$ref": "#/$defs/ObjectReference"
        }
      },
      "required": [
        "@id",
        "@type",
        "tableSchema"
      ],
      "title": "FileList",
      "type": "object"
    },
    "defaults": {}
  },
  "http://www.w3.org/ns/csvw#Schema": {
    "name": "TableSchema",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "column": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "minItems": 1,
          "title": "Column",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type",
        "column"
      ],
      "title": "TableSchema",
      "type": "object"
    },
    "defaults": {}
  },
  "http://www.w3.org/ns/csvw#Column": {
    "name": "Column",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "columnName": {
          "title": "Columnname",
          "type": "string"
        },
        "propertyUrl": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Propertyurl"
        }
      },
      "required": [
        "@id",
        "@type",
        "columnName"
      ],
      "title": "Column",
      "type": "object"
    },
    "defaults": {
      "propertyUrl": null
    }
  },
  "http://bia/Image": {
    "name": "Image",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "resultOf": {
          "$ref": "#/$defs/ObjectReference"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        }
      },
      "required": [
        "@id",
        "@type",
        "resultOf"
      ],
      "title": "Image",
      "type": "object"
    },
    "defaults": {
      "name": null
    }
  },
  "http://bia/AnnotationData": {
    "name": "AnnotationData",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "resultOf": {
          "$ref": "#/$defs/ObjectReference"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        }
      },
      "required": [
        "@id",
        "@type",
        "resultOf"
      ],
      "title": "AnnotationData",
      "type": "object"
    },
    "defaults": {
      "name": null
    }
  },
  "http://bia/Specimen": {
    "name": "Specimen",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "biologicalEntity": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "minItems": 1,
          "title": "Biologicalentity",
          "type": "array"
        },
        "imagingPreparationProtocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "minItems": 1,
          "title": "Imagingpreparationprotocol",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type",
        "biologicalEntity",
        "imagingPreparationProtocol"
      ],
      "title": "Specimen",
      "type": "object"
    },
    "defaults": {}
  },
  "http://bia/CreationProcess": {
    "name": "CreationProcess",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "imageAcquisitionProtocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Imageacquisitionprotocol",
          "type": "array"
        },
        "subject": {
          "anyOf": [
            {
              "$ref": "#/$defs/ObjectReference"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        },
        "protocol": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Protocol",
          "type": "array"
        },
        "annotationMethod": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Annotationmethod",
          "type": "array"
        },
        "inputImage": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Inputimage",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "CreationProcess",
      "type": "object"
    },
    "defaults": {
      "imageAcquisitionProtocol": [],
      "subject": null,
      "protocol": [],
      "annotationMethod": [],
      "inputImage": []
    }
  },
  "http://bia/BioSample": {
    "name": "BioSample",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Name"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "experimentalVariableDescription": {
          "items": {
            "type": "string"
          },
          "title": "Experimentalvariabledescription",
          "type": "array"
        },
        "extrinsicVariableDescription": {
          "items": {
            "type": "string"
          },
          "title": "Extrinsicvariabledescription",
          "type": "array"
        },
        "intrinsicVariableDescription": {
          "items": {
            "type": "string"
          },
          "title": "Intrinsicvariabledescription",
          "type": "array"
        },
        "organismClassification": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Organismclassification",
          "type": "array"
        },
        "growthProtocol": {
          "anyOf": [
            {
              "$ref": "#/$defs/ObjectReference"
            },
            {
              "type": "null"
            }
          ],
          "default": null
        }
      },
      "required": [
        "@id",
        "@type",
        "description"
      ],
      "title": "BioSample",
      "type": "object"
    },
    "defaults": {
      "name": null,
      "experimentalVariableDescription": [],
      "extrinsicVariableDescription": [],
      "intrinsicVariableDescription": [],
      "organismClassification": [],
      "growthProtocol": null
    }
  },
  "http://bia/Taxon": {
    "name": "Taxon",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "commonName": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Commonname"
        },
        "scientificName": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Scientificname"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "Taxon",
      "type": "object"
    },
    "defaults": {
      "commonName": null,
      "scientificName": null
    }
  },
  "http://bia/Protocol": {
    "name": "Protocol",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description"
      ],
      "title": "Protocol",
      "type": "object"
    },
    "defaults": {
      "abstract": null
    }
  },
  "http://bia/SpecimenImagingPreparationProtocol": {
    "name": "SpecimenImagingPreparationProtocol",
    "schema": {
      "$defs": {
        "ObjectReference": {
          "properties": {
            "@id": {
              "title": "@Id",
              "type": "string"
            }
          },
          "required": [
            "@id"
          ],
          "title": "ObjectReference",
          "type": "object"
        }
      },
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        },
        "signalChannelInformation": {
          "items": {
            "$ref": "#/$defs/ObjectReference"
          },
          "title": "Signalchannelinformation",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description"
      ],
      "title": "SpecimenImagingPreparationProtocol",
      "type": "object"
    },
    "defaults": {
      "abstract": null,
      "signalChannelInformation": []
    }
  },
  "http://bia/SignalChannel": {
    "name": "SignalChannelInformation",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "signalContrastMechanismDescription": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Signalcontrastmechanismdescription"
        },
        "channelContentDescription": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Channelcontentdescription"
        },
        "channelBiologicalEntity": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Channelbiologicalentity"
        },
        "identifier": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Identifier"
        }
      },
      "required": [
        "@id",
        "@type"
      ],
      "title": "SignalChannelInformation",
      "type": "object"
    },
    "defaults": {
      "signalContrastMechanismDescription": null,
      "channelContentDescription": null,
      "channelBiologicalEntity": null,
      "identifier": null
    }
  },
  "http://bia/ImageAcquisitionProtocol": {
    "name": "ImageAcquisitionProtocol",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        },
        "imagingInstrumentDescription": {
          "title": "Imaginginstrumentdescription",
          "type": "string"
        },
        "imagingMethodName": {
          "items": {
            "type": "string"
          },
          "title": "Imagingmethodname",
          "type": "array"
        },
        "fbbiId": {
          "items": {
            "type": "string"
          },
          "title": "Fbbiid",
          "type": "array"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description",
        "imagingInstrumentDescription"
      ],
      "title": "ImageAcquisitionProtocol",
      "type": "object"
    },
    "defaults": {
      "abstract": null,
      "imagingMethodName": [],
      "fbbiId": []
    }
  },
  "http://bia/AnnotationMethod": {
    "name": "AnnotationMethod",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        },
        "annotationCriteria": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Annotationcriteria"
        },
        "annotationCoverage": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Annotationcoverage"
        },
        "transformationDescription": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Transformationdescription"
        },
        "spatialInformation": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Spatialinformation"
        },
        "methodType": {
          "items": {
            "type": "string"
          },
          "title": "Methodtype",
          "type": "array"
        },
        "annotationSourceIndicator": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Annotationsourceindicator"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description"
      ],
      "title": "AnnotationMethod",
      "type": "object"
    },
    "defaults": {
      "abstract": null,
      "annotationCriteria": null,
      "annotationCoverage": null,
      "transformationDescription": null,
      "spatialInformation": null,
      "methodType": [],
      "annotationSourceIndicator": null
    }
  },
  "http://bia/ImageAnalysisMethod": {
    "name": "ImageAnalysisMethod",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        },
        "featuresAnalysed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Featuresanalysed"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description"
      ],
      "title": "ImageAnalysisMethod",
      "type": "object"
    },
    "defaults": {
      "abstract": null,
      "featuresAnalysed": null
    }
  },
  "http://bia/ImageCorrelationMethod": {
    "name": "ImageCorrelationMethod",
    "schema": {
      "additionalProperties": true,
      "properties": {
        "@id": {
          "title": "@Id",
          "type": "string"
        },
        "@type": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "items": {
                "type": "string"
              },
              "type": "array"
            }
          ],
          "title": "@Type"
        },
        "name": {
          "title": "Name",
          "type": "string"
        },
        "description": {
          "title": "Description",
          "type": "string"
        },
        "abstract": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Abstract"
        },
        "fiducialsUsed": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Fiducialsused"
        },
        "transformationMatrix": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "type": "null"
            }
          ],
          "default": null,
          "title": "Transformationmatrix"
        }
      },
      "required": [
        "@id",
        "@type",
        "name",
        "description"
      ],
      "title": "ImageCorrelationMethod",
      "type": "object"
    },
    "defaults": {
      "abstract": null,
      "fiducialsUsed": null,
      "transformationMatrix": null
    }
  }
};

export const STANDARD_CONTEXT = {
  "@type": {
    "@container": "@set"
  },
  "abstract": {
    "@id": "schema:abstract"
  },
  "accessionId": {
    "@id": "bia:accessionId"
  },
  "acknowledgement": {
    "@id": "bia:acknowledgement"
  },
  "additionalType": {
    "@id": "schema:additionalType"
  },
  "address": {
    "@id": "schema:address"
  },
  "annotationCoverage": {
    "@id": "bia:annotationCoverage"
  },
  "annotationCriteria": {
    "@id": "bia:annotationCriteria"
  },
  "annotationMethod": {
    "@id": "bia:annotationMethod",
    "@container": "@set"
  },
  "annotationSourceIndicator": {
    "@id": "bia:annotationSourceIndicator"
  },
  "associatedAnnotationMethod": {
    "@id": "bia:associatedAnnotationMethod",
    "@container": "@set"
  },
  "associatedBiologicalEntity": {
    "@id": "bia:associatedBiologicalEntity",
    "@container": "@set"
  },
  "associatedCreationProcess": {
    "@id": "bia:associatedCreationProcess"
  },
  "associatedImageAcquisitionProtocol": {
    "@id": "bia:associatedImageAcquisitionProtocol",
    "@container": "@set"
  },
  "associatedImageAnalysisMethod": {
    "@id": "bia:associatedAnalysisMethod",
    "@container": "@set"
  },
  "associatedImageCorrelationMethod": {
    "@id": "bia:associatedCorrelationMethod",
    "@container": "@set"
  },
  "associatedProtocol": {
    "@id": "bia:associatedProtocol",
    "@container": "@set"
  },
  "associatedSourceImage": {
    "@id": "bia:associatedSourceImage",
    "@container": "@set"
  },
  "associatedSpecimen": {
    "@id": "bia:associatedSubject"
  },
  "associatedSpecimenImagingPreparationProtocol": {
    "@id": "bia:associatedImagingPreparationProtocol",
    "@container": "@set"
  },
  "author": {
    "@id": "schema:author",
    "@container": "@set"
  },
  "authorNames": {
    "@id": "bia:authorNames"
  },
  "bia": "http://bia/",
  "biologicalEntity": {
    "@id": "bia:sampleOf",
    "@container": "@set"
  },
  "channelBiologicalEntity": {
    "@id": "bia:channelBiologicalEntity"
  },
  "channelContentDescription": {
    "@id": "bia:channelContentDescription"
  },
  "column": {
    "@id": "csvw:column",
    "@container": "@set"
  },
  "columnName": {
    "@id": "csvw:name"
  },
  "commonName": {
    "@id": "http://rs.tdwg.org/dwc/terms/vernacularName"
  },
  "csvw": "http://www.w3.org/ns/csvw#",
  "dateModified": {
    "@id": "schema:dateModified"
  },
  "datePublished": {
    "@id": "schema:datePublished"
  },
  "dc": "http://purl.org/dc/terms/",
  "description": {
    "@id": "schema:description"
  },
  "doi": {
    "@id": "bia:doi"
  },
  "email": {
    "@id": "schema:email"
  },
  "experimentalVariableDescription": {
    "@id": "bia:experimentalVariableDescription",
    "@container": "@set"
  },
  "extrinsicVariableDescription": {
    "@id": "bia:extrinsicVariableDescription",
    "@container": "@set"
  },
  "fbbiId": {
    "@id": "bia:fbbiId",
    "@container": "@set"
  },
  "featuresAnalysed": {
    "@id": "bia:featuresAnalysed"
  },
  "fiducialsUsed": {
    "@id": "bia:fiducialsUsed"
  },
  "funder": {
    "@id": "schema:funder",
    "@container": "@set"
  },
  "funding": {
    "@id": "schema:funding",
    "@container": "@set"
  },
  "fundingStatement": {
    "@id": "bia:fundingStatement"
  },
  "growthProtocol": {
    "@id": "bia:growthProtocol"
  },
  "hasPart": {
    "@id": "schema:hasPart",
    "@container": "@set"
  },
  "identifier": {
    "@id": "schema:identifier"
  },
  "imageAcquisitionProtocol": {
    "@id": "bia:imageAcquisitionProtocol",
    "@container": "@set"
  },
  "imagingInstrumentDescription": {
    "@id": "bia:imagingInstrumentDescription"
  },
  "imagingMethodName": {
    "@id": "bia:imagingMethodName",
    "@container": "@set"
  },
  "imagingPreparationProtocol": {
    "@id": "bia:imagingPreparationProtocol",
    "@container": "@set"
  },
  "inputImage": {
    "@id": "bia:inputImage",
    "@container": "@set"
  },
  "intrinsicVariableDescription": {
    "@id": "bia:intrinsicVariableDescription",
    "@container": "@set"
  },
  "keywords": {
    "@id": "schema:keywords",
    "@container": "@set"
  },
  "license": {
    "@id": "schema:license"
  },
  "memberOf": {
    "@id": "schema:memberOf",
    "@container": "@set"
  },
  "methodType": {
    "@id": "bia:annotationMethodType",
    "@container": "@set"
  },
  "name": {
    "@id": "schema:name"
  },
  "organismClassification": {
    "@id": "schema:taxonomicRange",
    "@container": "@set"
  },
  "propertyUrl": {
    "@id": "csvw:propertyUrl"
  },
  "protocol": {
    "@id": "bia:protocol",
    "@container": "@set"
  },
  "pubmedId": {
    "@id": "bia:pubmedId"
  },
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "relatedPublication": {
    "@id": "bia:relatedPublication",
    "@container": "@set"
  },
  "resultOf": {
    "@id": "bia:resultOf"
  },
  "role": {
    "@id": "bia:role",
    "@container": "@set"
  },
  "schema": "http://schema.org/",
  "scientificName": {
    "@id": "http://rs.tdwg.org/dwc/terms/scientificName"
  },
  "seeAlso": {
    "@id": "http://www.w3.org/2000/01/rdf-schema#seeAlso",
    "@container": "@set"
  },
  "signalChannelInformation": {
    "@id": "bia:signalChannelInformation",
    "@container": "@set"
  },
  "signalContrastMechanismDescription": {
    "@id": "bia:signalContrastMechanismDescription"
  },
  "spatialInformation": {
    "@id": "bia:spatialInformation"
  },
  "subject": {
    "@id": "bia:subject"
  },
  "tableSchema": {
    "@id": "csvw:tableSchema"
  },
  "transformationDescription": {
    "@id": "bia:transformationDescription"
  },
  "transformationMatrix": {
    "@id": "bia:transformationMatrix"
  },
  "website": {
    "@id": "bia:website"
  },
  "yearPublished": {
    "@id": "bia:yearPublished"
  }
};
